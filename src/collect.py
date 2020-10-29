#!/usr/bin/python3
"""This module collects data available regarding FPL"""

import datetime
import json
import os
import pathlib
import pytz
import shutil
import time
from urllib.request import urlopen

import numpy as np
import pandas as pd
from selenium import webdriver
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.desired_capabilities import DesiredCapabilities
from selenium.webdriver.support import expected_conditions as EC
from sys import platform


FPL_API = {
    'now': "https://fantasy.premierleague.com/api/bootstrap-static/",
    'fixture': "https://fantasy.premierleague.com/api/fixtures/",
    'live': "https://fantasy.premierleague.com/api/event/{GW}/live/"
}


def get_all_data():
    """Checks and collects missing data from multiple resources"""
    input_folder, output_folder = create_folders()
    get_data_fpl_api(input_folder)
    get_data_fplreview(input_folder)
    generate_intermediate_layer(input_folder)
    return input_folder, output_folder


def create_folders():
    """Creates folders for data storage"""

    with urlopen(FPL_API['now']) as url:
        data = json.loads(url.read().decode())
    vals = read_static()
    season = vals['season']
    target_gw = [i['name'] for i in data['events'] if i['is_next']][0]
    gameweek = "GW" + str(target_gw.split()[1]).strip()
    date = datetime.datetime.now(pytz.timezone('EST')).date().isoformat()

    base_folder = pathlib.Path().resolve()
    input_folder = pathlib.Path(
        base_folder / f"build/data/{season}/{gameweek}/{date}/input/")
    input_folder.mkdir(parents=True, exist_ok=True)
    output_folder = pathlib.Path(
        base_folder / f"build/data/{season}/{gameweek}/{date}/output/")
    output_folder.mkdir(parents=True, exist_ok=True)
    return input_folder, output_folder


def get_data_fpl_api(target_folder):
    """Read and save values from FPL API to target folder"""

    with urlopen(FPL_API['now']) as url:
        data = json.loads(url.read().decode())

    element_data = pd.DataFrame(data['elements'])
    element_data.to_csv(target_folder / "element.csv")

    team_data = pd.DataFrame(data['teams'])
    team_data.to_csv(target_folder / "team.csv")

    element_type_data = pd.DataFrame(data['element_types'])
    element_type_data.to_csv(target_folder / "element_type.csv")

    with urlopen(FPL_API['fixture']) as url:
        data = json.loads(url.read().decode())

    fixture_data = pd.DataFrame(data)
    fixture_data.to_csv(target_folder / "fixture.csv")


def get_data_fplreview(target_folder, page="massive-data-planner", debug=False):
    """Grabs data from fplreview.com, assumes FPL API is already pulled in"""

    env = read_static()

    options = webdriver.ChromeOptions()
    options.add_argument("--no-sandbox")
    if not debug:
        options.add_argument("--headless")
    options.add_argument('--log-level=3')
    capa = DesiredCapabilities.CHROME
    capa["pageLoadStrategy"] = "none"
    if platform == "win32":
        options.add_experimental_option("prefs", {
            "download.default_directory": r"C:\temp",
            "download.prompt_for_download": False,
        })
        chrome = webdriver.Chrome(executable_path=env['win_driver'], options=options, desired_capabilities=capa)
    elif platform == "linux":
        options.add_argument('--disable-dev-shm-usage')
        options.add_experimental_option("prefs", {
            "download.default_directory": "/tmp",
            "download.prompt_for_download": False,
        })
        chrome = webdriver.Chrome(executable_path=env['unix_driver'], options=options, desired_capabilities=capa)
    
    print(".", end="", flush=True)
    wait = WebDriverWait(chrome, 30)
    chrome.implicitly_wait(30)
    chrome.maximize_window()
    chrome.get(r"https://fplreview.com/" + page + "/")
    wait.until(EC.presence_of_element_located((By.NAME, "TeamID")))
    e = chrome.find_element_by_id("Weeks")
    options = e.find_elements_by_tag_name("option")
    print(".", end="", flush=True)
    for i in options:
        if i.get_attribute("value") == "8":
            i.click()

    inputfield = chrome.find_element_by_name('TeamID')
    inputfield.send_keys("1")
    inputfield.send_keys(Keys.ENTER)

    wait.until(EC.visibility_of_element_located((By.ID, "orderModal_popop2")))
    e = chrome.find_elements_by_id("butt")
    print(".", end="", flush=True)
    for i in e:
        if i.is_displayed():
            i.click()

    wait.until(EC.presence_of_element_located((By.ID, "myGroup")))
    e = chrome.find_element_by_id("myGroup")
    options = e.find_elements_by_tag_name("option")
    print(".", end="", flush=True)
    options[-1].click()

    if os.path.exists("/tmp/fplreview.csv"):
        os.remove("/tmp/fplreview.csv")

    wait.until(EC.element_to_be_clickable((By.ID, 'exportbutton')))
    e = chrome.find_element_by_id('exportbutton')
    print(".")
    e.click()

    time.sleep(2)

    if platform == "linux":
        shutil.move("/tmp/fplreview.csv", target_folder / f"fplreview-{page}.csv")
    else:
        shutil.move(r"C:\temp\fplreview.csv", target_folder / f"fplreview-{page}.csv")

    chrome.close()
    print("Done")

    return


def generate_intermediate_layer(target_folder, page="massive-data-planner"):
    """Generates intermediate data layer to be consumed in optimization"""

    team_df = pd.read_csv(target_folder / "team.csv")
    fixture_df = pd.read_csv(target_folder / "fixture.csv")
    element_df = pd.read_csv(target_folder / "element.csv")
    prediction_df = pd.read_csv(target_folder / f"fplreview-{page}.csv").drop_duplicates()

    weeks =  [i.split('_')[0] for i in list(filter(lambda x: '_Pts' in x, prediction_df.columns.tolist()))]

    filtered_fixture = fixture_df[(fixture_df['event'] >= int(weeks[0])) & (fixture_df['event'] <= int(weeks[-1]))]
    filtered_fixture = filtered_fixture[['event', 'id', 'team_a', 'team_h']]
    home_games = filtered_fixture.rename(columns={'team_h': 'team', 'team_a': 'opp_team'}).copy().assign(side='home')
    away_games = filtered_fixture.rename(columns={'team_a': 'team', 'team_h': 'opp_team'}).copy().assign(side='away')
    combined_games = pd.concat([home_games, away_games], sort=False)

    element_df = pd.merge(element_df, team_df.rename(columns={'id': 'team_id', 'name': 'team_name'}), how='left', left_on=['team'], right_on=['team_id'])
    element_df = pd.merge(element_df, prediction_df, how='left', left_on=['web_name', 'team_name'], right_on=['Name', 'Team'])
    full_element_gameweek_df = pd.merge(left=element_df.rename(columns={'id': 'player_id'}).assign(key=1), right=pd.DataFrame(weeks, columns=['event']).assign(key=1), on='key', how='inner').drop(["key"], axis=1)

    full_element_gameweek_df['event'] = full_element_gameweek_df['event'].astype(int)
    element_gameweek_df = pd.merge(left=full_element_gameweek_df, right=combined_games.rename(columns={'id': 'event_id'}), on=['event', 'team'], how='left')
    element_gameweek_df['points_md'] = element_gameweek_df.apply(get_element_event_expected_points, axis=1)
    element_gameweek_df = element_gameweek_df[['player_id', 'event', 'event_id', 'web_name', 'points_md', 'team', 'opp_team']].copy()
    element_gameweek_df.sort_values(by=['player_id', 'event'], inplace=True, ignore_index=True)
    element_gameweek_df.to_csv(target_folder / f'element_gameweek.csv')


def read_static():
    """Reads user-specified static values from JSON file"""

    base_folder = pathlib.Path().resolve()
    with open(base_folder / 'static-values.json') as f:
        data = json.load(f)
    return data


def get_element_event_expected_points(r):
    if np.isnan(r['event']):
        return 0
    else:
        try:
            sc = float(r[f"{int(r['event'])}_Pts"])
            if np.isnan(sc):
                return 0
            elif sc is None:
                return 0
            else:
                return sc
        except:
            return 0

# TODO: fbref?

if __name__ == "__main__":
    get_all_data()
