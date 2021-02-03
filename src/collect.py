#!/usr/bin/python3
"""This module collects data available regarding FPL"""

import datetime
import json
import math
import os
import pathlib
import pytz
import random
import shutil
import time
from urllib.request import urlopen

from functools import wraps
import itertools
import numpy as np
import pandas as pd
from selenium import webdriver
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.desired_capabilities import DesiredCapabilities
from selenium.webdriver.support import expected_conditions as EC
from sys import platform
from concurrent.futures import ProcessPoolExecutor


FPL_API = {
    'now': "https://fantasy.premierleague.com/api/bootstrap-static/",
    'fixture': "https://fantasy.premierleague.com/api/fixtures/",
    'live': "https://fantasy.premierleague.com/api/event/{GW}/live/",
    'team_info': "https://fantasy.premierleague.com/api/entry/{PID}/",
    'picks': "https://fantasy.premierleague.com/api/entry/{PID}/event/{GW}/picks/",
    'overall': "https://fantasy.premierleague.com/api/leagues-classic/{LID}/standings/?page_standings={P}"
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
    elif platform == "darwin":
        chrome=webdriver.Chrome()
        
    print(".", end="", flush=True)
    wait = WebDriverWait(chrome, 60)
    chrome.implicitly_wait(60)
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

    try:
        print("Trying to fetch with HiveMind")
        wait.until(EC.visibility_of_element_located((By.ID, "orderModal_popop2")))
    except:
        print("Trying to fetch without HiveMind")
        wait.until(EC.visibility_of_element_located((By.ID, "orderModal_popop")))
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

    if platform == "win32":
        shutil.move(r"C:\temp\fplreview.csv", target_folder / f"fplreview-{page}.csv")
    elif platform == "linux":
        shutil.move("/tmp/fplreview.csv", target_folder / f"fplreview-{page}.csv")
    elif platform == "darwin":
        shutil.move((os.path.expanduser("~/Downloads/fplreview.csv")), target_folder / f"fplreview-{page}.csv")
  
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
    element_gameweek_df['xmins_md'] = element_gameweek_df.apply(get_element_event_expected_minutes, axis=1)
    element_gameweek_df = element_gameweek_df[['player_id', 'event', 'event_id', 'web_name', 'points_md', 'xmins_md', 'team', 'opp_team']].copy()
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

def get_element_event_expected_minutes(r):
    if np.isnan(r['event']):
        return 0
    else:
        try:
            sc = float(r[f"{int(r['event'])}_xMins"])
            if np.isnan(sc):
                return 0
            elif sc is None:
                return 0
            else:
                return sc
        except:
            return 0


def sample_fpl_teams(gw=None):

    sample_dict = dict()

    t0 = time.time()
    with urlopen(FPL_API['now']) as url:
        data = json.loads(url.read().decode())
    total_players = data['total_players']
    if gw is None:
        try:
            gw = list(filter((lambda x: x['is_current']), data['events']))[0]['id']
        except:
            gw = list(filter((lambda x: x['is_previous']), data['events']))[0]['id']
    
    base_folder = pathlib.Path().resolve()
    input_folder = pathlib.Path(base_folder / f"build/sample/{gw}/")
    input_folder.mkdir(parents=True, exist_ok=True)

    # Part 1 - 99% Overall sampling
    selected_ids = random.sample(range(1, total_players), 666)
    with ProcessPoolExecutor(max_workers=8) as executor:
        random_squads = list(executor.map(get_single_team_data, selected_ids, itertools.repeat(gw)))
    random_squads = [i for i in random_squads if i is not None]
    print("Sampled", len(random_squads), "random teams")
    sample_dict['Overall'] = random_squads

    # Part 2 - Various Ranges
    pairs = [[100, 80], [1000, 278], [10000, 370], [100000, 383], [1000000, 385]]
    for target, nsample in pairs:
        print(f"Sampling inside top {target}")
        player_targets = random.sample(range(1, target+1), nsample)
        with ProcessPoolExecutor(max_workers=8) as executor:
            grabbed_squads = list(executor.map(get_rank_n_player, player_targets, itertools.repeat(gw)))
        grabbed_squads = [i for i in grabbed_squads if i is not None]
        sample_dict[target] = grabbed_squads

    with open(input_folder / 'fpl_sampled.json', 'w') as file:
        json.dump(sample_dict, file)
    
    print('Took', time.time()-t0, 'seconds')


def get_rank_n_player(rank, gw):
    page = ((rank-1)//50)+1
    order = (rank-1) % 50
    try:
        with urlopen(FPL_API['overall'].format(LID=314, P=page)) as url:
            page_data = json.loads(url.read().decode())
        tid = page_data['standings']['results'][order]['entry']
        return get_single_team_data(tid, gw)
    except:
        print("Encountered page access error, waiting 5 seconds")
        time.sleep(5)
        return None


def get_single_team_data(tid, gw=16):
    "Returns single team data from FPL API"
    print(f"Getting {tid} for {gw}")
    time.sleep(0.1)
    team_keys = ['id', 'player_region_name', 'summary_overall_points', 'summary_overall_rank', 'name']
    try:
        with urlopen(FPL_API['team_info'].format(PID=tid)) as url:
            team_data = json.loads(url.read().decode())
        with urlopen(FPL_API['picks'].format(PID=tid, GW=gw)) as url:
            pick_data = json.loads(url.read().decode())
        return {'team': {key: team_data[key] for key in team_keys}, 'data': pick_data}
    except Exception as e:
        print("Encountered error, waiting 3 seconds:", e)
        time.sleep(3)
        return None


def get_fpl_info(info_type, **kwargs):
    "Return requested fpl info"
    with urlopen(FPL_API[info_type].format(**kwargs)) as url:
        data = json.loads(url.read().decode())
    return data


def get_fpl_analytics_league(target_folder, debug=False):
    base_folder = pathlib.Path().resolve()
    with open(base_folder / 'static/json/fpl_analytics.json') as f:
        data = json.load(f)

    if debug:
        review_values = [get_team_season_review(data[0], True)]
    else:
        with ProcessPoolExecutor(max_workers=8) as executor:
            review_values = list(executor.map(get_team_season_review, data, itertools.repeat(False)))

    review_values = [i for i in review_values if i is not None]
    df = pd.DataFrame(review_values)
    print(df)
    df.to_csv(target_folder / 'fpl_analytics_league.csv')
    

def retry(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        cnt = 0
        while cnt < 4:
            try:
                return f(*args, **kwargs)
            except:
                cnt += 1
                pass
        print("Function failed for 4 times")
        print(kwargs)
        return None
    return wrapped


@retry
def get_team_season_review(team, debug=False):

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
    wait = WebDriverWait(chrome, 90)
    chrome.implicitly_wait(90)
    chrome.maximize_window()
    chrome.get(r"https://fplreview.com/season-review")

    team_vals = {'twitter': team['twitter']}
    print(f"Parsing {team['twitter']} season review")
    wait.until(EC.presence_of_element_located((By.NAME, "TeamID")))
    inputfield = chrome.find_element_by_name('TeamID')
    inputfield.send_keys(team['id'])
    time.sleep(2)
    inputfield.send_keys(Keys.ENTER)
    try:
        wait.until(EC.presence_of_element_located((By.ID, "points_table")))
    except:
        try:
            print(f"First wait failed for {team['twitter']}, second try")
            inputfield = chrome.find_element_by_name('TeamID')
            inputfield.clear()
            inputfield.send_keys(team['id'])
            time.sleep(4)
            inputfield.send_keys(Keys.ENTER)
            wait.until(EC.presence_of_element_located((By.ID, "points_table")))
        except:
            print(f"Second wait failed for {team['twitter']}, final try")
            chrome.get(r"https://fplreview.com/season-review")
            wait.until(EC.presence_of_element_located((By.NAME, "TeamID")))
            time.sleep(4)
            inputfield = chrome.find_element_by_name('TeamID')
            inputfield.send_keys(team['id'])
            time.sleep(4)
            inputfield.send_keys(Keys.ENTER)
            wait.until(EC.presence_of_element_located((By.ID, "points_table")))

    score_table = chrome.find_element(By.ID, 'points_table')
    rows = score_table.find_elements_by_tag_name('tr')
    result_row = rows[1].find_elements_by_tag_name('td')
    rank_row = rows[2].find_elements_by_tag_name('td')
    wait.until(EC.text_to_be_present_in_element((By.XPATH, '//tr[2]/td[6]'), '%'))        
    team_vals['FPL'] = float(result_row[1].text)
    team_vals['xG'] = float(result_row[2].text)
    team_vals['IO'] = float(result_row[3].text)
    team_vals['MD'] = float(result_row[4].text)
    team_vals['Luck'] = float(result_row[5].text)
    team_vals['FPL_Rank'] = int(rank_row[1].text.replace(',', ''))
    team_vals['xG_Rank'] = int(rank_row[2].text.replace(',', ''))
    team_vals['IO_Rank'] = int(rank_row[3].text.replace(',', ''))
    team_vals['MD_Rank'] = int(rank_row[4].text.replace(',', ''))
    team_vals['Luck_Rank'] = rank_row[5].text
    chrome.close()
    print(f"Done {team['twitter']}")
    return team_vals


# TODO: fbref?

if __name__ == "__main__":
    # input_folder, output_folder = create_folders()
    # get_fpl_analytics_league(input_folder)
    # get_all_data()
    # r = get_single_team_data(2221044, 16)
    # print(r)
    # sample_fpl_teams()

    # r = get_fpl_info('live', GW=17)
    # print(r)

    input_folder, output_folder = create_folders()
    get_fpl_analytics_league(input_folder, True)

    pass
