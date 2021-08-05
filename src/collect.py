#!/usr/bin/python3
"""This module collects data available regarding FPL"""

import datetime
import json
import math
import os
import sys
import pathlib
from threading import local
import pytz
import random
import shutil
import time
from urllib.request import urlopen
import requests

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
import glob
from fplreview import get_data_fplreview
from encrypt import encrypt


FPL_API = {
    'now': "https://fantasy.premierleague.com/api/bootstrap-static/",
    'fixture': "https://fantasy.premierleague.com/api/fixtures/",
    'live': "https://fantasy.premierleague.com/api/event/{GW}/live/",
    'team_info': "https://fantasy.premierleague.com/api/entry/{PID}/",
    'picks': "https://fantasy.premierleague.com/api/entry/{PID}/event/{GW}/picks/",
    'transfers': "https://fantasy.premierleague.com/api/entry/{PID}/transfers/",
    'history': "https://fantasy.premierleague.com/api/entry/{PID}/history/",
    'overall': "https://fantasy.premierleague.com/api/leagues-classic/{LID}/standings/?page_standings={P}"
}


def get_all_data():
    """Checks and collects missing data from multiple resources"""
    input_folder, output_folder, season_folder = create_folders()
    get_fixture(season_folder)
    get_data_fpl_api(input_folder)
    get_data_fplreview(input_folder, page='free-planner')
    generate_intermediate_layer(input_folder, page='free-planner')
    get_fivethirtyeight_data(input_folder)
    # cache_realized_points_data(season_folder)
    return input_folder, output_folder


def create_folders():
    """Creates folders for data storage"""
    with urlopen(FPL_API['now']) as url:
        data = json.loads(url.read().decode())
    vals = read_static()
    season = vals['season']
    try:
        target_gw = [i['name'] for i in data['events'] if i['is_next']][0]
    except:
        target_gw = "GW 38"
    gw_numeric = int(target_gw.split()[1])
    gameweek = "GW" + str(target_gw.split()[1]).strip()
    date = datetime.datetime.now(pytz.timezone('EST')).date().isoformat()

    base_folder = pathlib.Path().resolve()
    input_folder = pathlib.Path(
        base_folder / f"build/data/{season}/{gameweek}/{date}/input/")
    input_folder.mkdir(parents=True, exist_ok=True)
    output_folder = pathlib.Path(
        base_folder / f"build/data/{season}/{gameweek}/{date}/output/")
    output_folder.mkdir(parents=True, exist_ok=True)

    season_folder = pathlib.Path(base_folder / f"build/data/{season}/")
    
    print("Creating folder -- done")
    return input_folder, output_folder, season_folder


def get_fixture(season_folder):
    with urlopen(FPL_API['fixture']) as url:
        data = json.loads(url.read().decode())
    with open(season_folder / "fixture.json", "w") as f:
        json.dump(data, f)
    print("Getting fixture -- done")


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
    print("Getting FPL API data -- done")


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

    print("Generating intermediate data -- done")


def encrypt_files(target_folder, page, remove=True):
    encrypt(str(target_folder / f'element_gameweek.csv'), key_name='REVIEW_KEY')
    encrypt(str(target_folder / f'fplreview-{page}.csv'), key_name='REVIEW_KEY')
    if remove:
        os.remove(target_folder / f'element_gameweek.csv')
        os.remove(target_folder / f'fplreview-{page}.csv')

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


def sample_fpl_teams(gw=None, seed=None):

    sample_dict = dict()

    if seed is not None:
        random.seed(seed)

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
    # selected_ids = random.sample(range(1, total_players), 2000)
    with ProcessPoolExecutor(max_workers=8) as executor:
        random_squads = list(executor.map(get_single_team_data, selected_ids, itertools.repeat(gw)))
    random_squads = [i for i in random_squads if i is not None]
    print("Sampled", len(random_squads), "random teams")
    sample_dict['Overall'] = random_squads

    # Part 2 - Various Ranges
    pairs = [[100, 80], [1000, 278], [10000, 370], [100000, 383], [1000000, 385]]
    # pairs = [[100, 100], [1000, 500], [10000, 600], [100000, 800], [1000000, 1000]]
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
    # https://fplrevver.blob.core.windows.net/fpldata/analytics_league.csv
    base_folder = pathlib.Path().resolve()
    with open(base_folder / 'static/json/fpl_analytics.json') as f:
        data = json.load(f)

    if debug:
        review_values = [get_team_season_review(data[0], True)]
    else:
        with ProcessPoolExecutor(max_workers=16) as executor:
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
            except Exception as e:
                print(e)
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
    wait = WebDriverWait(chrome, 120)
    chrome.implicitly_wait(120)
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

    wait.until(EC.text_to_be_present_in_element((By.XPATH, '//tr[5]/td[3]'), '%'))
    score_table = chrome.find_element(By.ID, 'points_table')
    rows = score_table.find_elements_by_tag_name('tr')
    for group in list(zip(range(1,6), ['FPL', 'xG', 'IO', 'MD', 'Luck'])):
        print(group[0])
        row_text = rows[group[0]].text.split()
        team_vals[group[1]] = float(row_text[-2])
        team_vals[f'{group[1]}_Rank'] = float(row_text[-1]) if '%' not in row_text[-1] else row_text[-1]
    chrome.close()
    print(f"Done {team['twitter']}")
    return team_vals


def get_fivethirtyeight_data(target_folder):
    # https://projects.fivethirtyeight.com/soccer-api/club/spi_global_rankings.csv
    fte_data = "https://projects.fivethirtyeight.com/soccer-api/club/spi_global_rankings.csv"
    with urlopen(fte_data) as url, open(target_folder / 'fivethirtyeight_spi.csv', 'w') as f:
        data = url.read().decode()
        f.write(data)
    print("Generating 538 data -- done")


def cache_realized_points_data(season_folder):
    gw_data = {}
    for gw in range(1,39):
        r = requests.get(FPL_API['live'].format(GW=gw))
        if r.status_code == 200:
            raw_data = r.json()
            gw_data[gw] = [{'id': i['id'], 'e': i['explain']} for i in raw_data['elements'] if i['stats']['minutes']!=0]
    with open(season_folder / "points.json", "w") as file:
        json.dump(gw_data, file)
    print("Cache file generated")


def cache_effective_ownership(season_folder):
    files = glob.glob('build/sample/*/fpl_sampled.json')
    if sys.platform == 'win32':
        files = [{'gw': int(i.replace('\\', '/').split('/')[2]), 'file': i} for i in files]
    files = sorted(files, key=lambda i: i['gw'])
    season_eo = {}
    for f in files:
        with open(f['file'], 'r') as file:
            data = json.loads(file.read())
            picks_dict = dict()
            for key in data.keys():
                tier_picks = picks_dict[key] = {}
                for team in data[key]:
                    for player in team['data']['picks']:
                        pid = player['element']
                        tier_picks[pid] = tier_picks.get(pid, {'count': 0, 'multiplier': 0, 'eo': 0})
                        tier_picks[pid]['count'] += 1
                        tier_picks[pid]['multiplier'] += player['multiplier']
                        tier_picks[pid]['eo'] = round(tier_picks[pid]['multiplier'] / len(data[key]) * 100, 2)
            season_eo[f['gw']] = picks_dict
    with open(season_folder / 'eo.json', 'w') as file:
        json.dump(season_eo, file)
    return


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

    # input_folder, output_folder = create_folders()
    # get_fpl_analytics_league(input_folder, True)

    # pass

    # input_folder, output_folder, season_folder = create_folders()
    # cache_realized_points_data(season_folder)
    # cache_effective_ownership(season_folder)
    # print(gw_no)
    # get_fivethirtyeight_data(input_folder)

    # get_team_season_review({'twitter': 'x', 'id': 2221044}, True)

    # for gw in range(1, 39):
    #     sample_fpl_teams(gw)
    #     time.sleep(10)

    input_folder, output_folder, season_folder = create_folders()
    cache_effective_ownership(season_folder)

    pass
