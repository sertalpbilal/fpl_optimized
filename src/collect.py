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
from encrypt import encrypt, decrypt

import aiohttp
import asyncio
import platform
from asyncio.proactor_events import _ProactorBasePipeTransport
from functools import wraps

from collections import OrderedDict

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
    next_gw = get_gw()
    input_folder, output_folder, season_folder = create_folders()
    get_fixture(season_folder)
    get_data_fpl_api(input_folder, season_folder)
    if next_gw != 39:
        from fplreview import get_data_fplreview
        get_data_fplreview(input_folder, page='free-planner', rename='free-planner', method='legacy')
        generate_intermediate_layer(input_folder, page='free-planner')
        # get_fivethirtyeight_data(input_folder)

    cache_effective_ownership(season_folder)
    # get_fivethirtyeight_data(season_folder)
    cache_realized_points_data(season_folder)
    cache_projected_points(season_folder)

    # from xp_league import detect_missing_entries_and_fill, cache_xp_ranks
    # detect_missing_entries_and_fill()
    # if next_gw > 1:
    #     cache_xp_ranks(output_folder)
    # TODO disabled temporarily!

    return input_folder, output_folder, next_gw


def get_gw():
    with urlopen(FPL_API['now']) as url:
        data = json.loads(url.read().decode())
    try:
        target_gw = [i['name'] for i in data['events'] if i['is_next']][0]
    except:
        target_gw = "GW 39"
    gw = int(target_gw.split()[1])
    print(f"Gameweek {gw}")
    return gw

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

    current_gw = target_gw
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


def get_data_fpl_api(target_folder, season_folder=None):
    """Read and save values from FPL API to target folder"""

    with urlopen(FPL_API['now']) as url:
        data = json.loads(url.read().decode())
    if season_folder is not None:
        with open(season_folder / "static.json", "w") as f:
            json.dump(data, f)

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
    # element_df = pd.merge(element_df, prediction_df, how='left', left_on=['web_name', 'team_name'], right_on=['Name', 'Team'])
    element_df = pd.merge(element_df, prediction_df, how='left', left_on=['id'], right_on=['ID'])
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
    encrypt(str(target_folder / f'detailed-fplreview-{page}.csv'), key_name='REVIEW_KEY')
    if remove:
        os.remove(target_folder / f'element_gameweek.csv')
        os.remove(target_folder / f'fplreview-{page}.csv')
        os.remove(target_folder / f'detailed-fplreview-{page}.csv')

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


def get_team_picks(team_ids, gw, info=None):

    async def get_picks(id_list, gw):
        async with aiohttp.ClientSession() as session:
            picks = await fetch_all_picks(session, id_list, gw)
            return picks

    async def fetch_all_picks(session, id_list, gw):
        urls = [f"https://fantasy.premierleague.com/api/entry/{i}/event/{gw}/picks/" for i in id_list]
        man_url = [f"https://fantasy.premierleague.com/api/entry/{i}/" for i in id_list]

        chunk_size = 20
        wait_length = 1.2

        pick_chunks = [urls[i:i+chunk_size] for i in range(len(urls))[::chunk_size]]
        info_chunks = [man_url[i:i+chunk_size] for i in range(len(man_url))[::chunk_size]]

        pick_data = []
        info_data = []

        iter_no = 0
        for pc, ic in zip(pick_chunks, info_chunks):
            print(f"Chunk: {iter_no+1}/{len(pick_chunks)}", end='')
            tasks = [fetch(session, url) for url in pc]
            man_tasks = [fetch(session, url) for url in ic]
            pick_data.append(await asyncio.gather(*tasks))
            info_data.append(await asyncio.gather(*man_tasks))
            print(": Done")
            iter_no += 1
            time.sleep(wait_length)


        man_data = sum(info_data, [])
        player_data = sum(pick_data, [])
        team_keys = ['id', 'player_region_name', 'summary_overall_points', 'summary_overall_rank', 'name']
        combined_data = []

        it = 0
        for team_info, pick_info in zip(man_data, player_data):
            try:
                entry = {'team': {key: team_info[key] for key in team_keys}, 'data': pick_info}
                if info is not None:
                    entry['info'] = info[it]
                combined_data.append(entry)
            except:
                pass
            it = it + 1
        return combined_data

    async def fetch(session, url):
        # print(f"Fetching {url}")
        headers = {"User-Agent": ""}
        async with session.get(url, headers=headers) as response:
            if response.status == 200:
                # print(f"{url} done")
                return await response.json()
            else:
                print(f"Response {response.status} -- {url}")
                return None

    def silence_event_loop_closed(func):
        @wraps(func)
        def wrapper(self, *args, **kwargs):
            try:
                return func(self, *args, **kwargs)
            except RuntimeError as e:
                if str(e) != 'Event loop is closed':
                    raise
        return wrapper

    if platform.system() == 'Windows':
        # Silence the exception here.
        _ProactorBasePipeTransport.__del__ = silence_event_loop_closed(_ProactorBasePipeTransport.__del__)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    all_data = loop.run_until_complete(get_picks(team_ids, gw))
    
    try:
        loop.close()
    except:
        pass

    return all_data



def sample_fpl_teams(gw=None, seed=None):

    env = read_static()
    season = env['season']

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
    input_folder = pathlib.Path(base_folder / f"build/sample/{season}/{gw}/")
    input_folder.mkdir(parents=True, exist_ok=True)

    # Part 0 - FPL Research Top Managers
    print("Sampling Top 1000 Managers")
    # managers = pd.read_csv(base_folder / 'static/json/top_managers.tsv', sep="\t")
    managers = pd.read_csv(base_folder / 'static/json/top_managers.csv')
    team_ids = managers['Team ID']

    manager_info = managers.to_dict(orient='records')
    top_picks = get_team_picks(team_ids, gw, manager_info)

    print(f"Sampled top managers: {len(top_picks)}")

    with open(input_folder / 'top_managers.json', 'w') as file:
        json.dump(top_picks, file)

    time.sleep(1)

    # Part 1 - 99% Overall sampling
    print("Sampling 666 teams among overall FPL")
    max_id = max(total_players, 4000000)
    selected_ids = random.sample(range(1, max_id), 666)
    # selected_ids = random.sample(range(1, total_players), 2000)

    random_squads = get_team_picks(selected_ids, gw)

    # with ProcessPoolExecutor(max_workers=8) as executor:
    #     random_squads = list(executor.map(get_single_team_data, selected_ids, itertools.repeat(gw)))
    # random_squads = [i for i in random_squads if i is not None]
    print("Sampled", len(random_squads), "random teams")
    sample_dict['Overall'] = random_squads

    time.sleep(1)

    if int(gw) != 1:
        # print("PART2")
        # Part 2 - Various Ranges
        pairs = [[100, 80], [1000, 278], [10000, 370], [100000, 383], [1000000, 385]]
        for target, nsample in pairs:
            print(f"Sampling {nsample} teams inside top {target}")
            player_targets = random.sample(range(1, target+1), nsample)
            grabbed_squads = get_team_picks_from_rank(player_targets, gw)
            grabbed_squads = [i for i in grabbed_squads if i is not None]
            print(f"Sampled {len(grabbed_squads)} teams inside top {target}")
            sample_dict[target] = grabbed_squads
            time.sleep(1)

    with open(input_folder / 'fpl_sampled.json', 'w') as file:
        json.dump(sample_dict, file)
    
    print('Took', time.time()-t0, 'seconds')


def get_team_picks_from_rank(ranks, gw):
    
    async def fetch_team_ids(ranks):
        

        async with aiohttp.ClientSession() as session:
            team_ids = await get_ids(session, ranks)
            team_ids = [i for i in team_ids if i is not None]
            return team_ids

    async def get_ids(session, ranks):

        chunk_size = 20
        wait_length = 1.2

        URLS = []
        ORDERS = []
        for rank in ranks:
            page = ((rank-1)//50)+1
            order = (rank-1) % 50
            URLS.append(f"https://fantasy.premierleague.com/api/leagues-classic/314/standings/?page_standings={page}")
            ORDERS.append(order)

        url_chunks = [URLS[i:i+chunk_size] for i in range(len(URLS))[::chunk_size]]
        order_chunks = [ORDERS[i:i+chunk_size] for i in range(len(ORDERS))[::chunk_size]]

        id_data = []

        for url_next, order_next in zip(url_chunks, order_chunks):
            tasks = [get_team_id_from_standings(session, url, order) for (url,order) in zip(url_next, order_next)]
            tasks = [i for i in tasks if i is not None]
            id_data.append(await asyncio.gather(*tasks))
            time.sleep(wait_length)
        return id_data

    async def get_team_id_from_standings(session, url, order):
        headers = {"User-Agent": ""}
        async with session.get(url, headers=headers) as response:
            if response.status == 200:
                page_data = await response.json()
                try:
                    tid = page_data['standings']['results'][order]['entry']
                except:
                    tid = None
                return tid
            else:
                print(f"Response {response.status}")
                return None

    def silence_event_loop_closed(func):
        @wraps(func)
        def wrapper(self, *args, **kwargs):
            try:
                return func(self, *args, **kwargs)
            except RuntimeError as e:
                if str(e) != 'Event loop is closed':
                    raise
        return wrapper

    if platform.system() == 'Windows':
        # Silence the exception here.
        _ProactorBasePipeTransport.__del__ = silence_event_loop_closed(_ProactorBasePipeTransport.__del__)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    team_ids = sum(loop.run_until_complete(fetch_team_ids(ranks)), [])
    
    try:
        loop.close()
    except:
        pass
    
    print(f"Collected team ids: {team_ids}")

    picks = get_team_picks(team_ids, gw)

    return picks


# def get_rank_n_player(rank, gw):
#     page = ((rank-1)//50)+1
#     order = (rank-1) % 50
#     try:
#         with urlopen(FPL_API['overall'].format(LID=314, P=page)) as url:
#             page_data = json.loads(url.read().decode())
#         tid = page_data['standings']['results'][order]['entry']
#         return get_single_team_data(tid, gw)
#     except:
#         print("Encountered page access error, waiting 5 seconds")
#         time.sleep(5)
#         return None


# def get_single_team_data(tid, gw=16):
#     "Returns single team data from FPL API"
#     print(f"Getting {tid} for {gw}")
#     time.sleep(0.5)
#     team_keys = ['id', 'player_region_name', 'summary_overall_points', 'summary_overall_rank', 'name']
#     try:
#         with urlopen(FPL_API['team_info'].format(PID=tid)) as url:
#             team_data = json.loads(url.read().decode())
#         with urlopen(FPL_API['picks'].format(PID=tid, GW=gw)) as url:
#             pick_data = json.loads(url.read().decode())
#         time.sleep(0.5)
#         return {'team': {key: team_data[key] for key in team_keys}, 'data': pick_data}
#     except Exception as e:
#         print("Encountered error, waiting 3 seconds:", e)
#         time.sleep(3)
#         return None


def get_fpl_info(info_type, **kwargs):
    "Return requested fpl info"
    with urlopen(FPL_API[info_type].format(**kwargs)) as url:
        data = json.loads(url.read().decode())
    return data


# Old way of scraping data
# def get_fpl_analytics_league(target_folder, debug=False):
#     # https://fplrevver.blob.core.windows.net/fpldata/analytics_league.csv
#     base_folder = pathlib.Path().resolve()
#     with open(base_folder / 'static/json/fpl_analytics.json') as f:
#         data = json.load(f)

#     if debug:
#         review_values = [get_team_season_review(data[0], True)]
#     else:
#         with ProcessPoolExecutor(max_workers=16) as executor:
#             review_values = list(executor.map(get_team_season_review, data, itertools.repeat(False)))

#     review_values = [i for i in review_values if i is not None]
#     df = pd.DataFrame(review_values)
#     print(df)
#     df.to_csv(target_folder / 'fpl_analytics_league.csv')
    

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
    if platform.system() == "Windows":
        options.add_experimental_option("prefs", {
            "download.default_directory": r"C:\temp",
            "download.prompt_for_download": False,
        })
        chrome = webdriver.Chrome(executable_path=env['win_driver'], options=options, desired_capabilities=capa)
    elif platform.system() == "Linux":
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

    maxgw = get_gw()

    gw_data = {}
    for gw in range(1,maxgw):
        r = requests.get(FPL_API['live'].format(GW=gw))
        if r.status_code == 200:
            raw_data = r.json()
            gw_data[gw] = [{'id': i['id'], 'e': i['explain']} for i in raw_data['elements'] if i['stats']['minutes']!=0]
    with open(season_folder / "points.json", "w") as file:
        json.dump(gw_data, file)
    print("Cache file generated")


def cache_effective_ownership(season_folder):

    vals = read_static()
    season = vals['season']

    files = glob.glob(f'build/sample/{season}/*/fpl_sampled.json')
    print(files)
    if len(files) > 0:
        print(files[0].replace('\\', '/').split('/'))
    if True: # sys.platform == 'win32':
        files = [{'gw': int(i.replace('\\', '/').split('/')[3]), 'file': i} for i in files]
    print(files)
    files = sorted(files, key=lambda i: i['gw'])
    season_eo = {}
    for f in files:
        with open(f['file'], 'r') as file:
            data = json.loads(file.read())
        picks_dict = dict()
        for key in data.keys():
            tier_picks = picks_dict[key] = {}
            tier_picks['meta'] = {'count': 0, 'hit_total': 0, 'teams': len(data[key])}
            for team in data[key]:

                if team['data'] is None:
                    print(f"Team has no data {team}, skipping...")
                    continue

                try:
                    hits = team['data']['entry_history']['event_transfers_cost']
                except:
                    hits = 0
                if hits > 0 and hits <= 60:
                    tier_picks['meta']['count'] += 1
                    tier_picks['meta']['hit_total'] += hits

                for player in team['data']['picks']:
                    pid = player['element']
                    tier_picks[pid] = tier_picks.get(pid, {'count': 0, 'multiplier': 0, 'eo': 0})
                    tier_picks[pid]['count'] += 1
                    tier_picks[pid]['multiplier'] += player['multiplier']
                    tier_picks[pid]['eo'] = round(tier_picks[pid]['multiplier'] / len(data[key]) * 100, 2)
        try:
            with open(f['file'].replace("fpl_sampled", "top_managers"), 'r') as file2:
                prime_data = json.loads(file2.read())
            prime_picks = picks_dict['Prime'] = {}
            prime_picks['meta'] = {'count': 0, 'hit_total': 0, 'teams': len(prime_data)}

            # TODO: apply autosub

            for team in prime_data:
                try:
                    hits = team['data']['entry_history']['event_transfers_cost']
                    if hits > 0 and hits <= 60:
                        prime_picks['meta']['count'] += 1
                        prime_picks['meta']['hit_total'] += hits
                except Exception as e:
                    print(e)
                    pass
                try:
                    team['data']['picks']
                except:
                    continue
                for player in team['data']['picks']:
                    pid = player['element']
                    prime_picks[pid] = prime_picks.get(pid, {'count': 0, 'multiplier': 0, 'eo': 0})
                    prime_picks[pid]['count'] += 1
                    prime_picks[pid]['multiplier'] += player['multiplier']
                    prime_picks[pid]['eo'] = round(prime_picks[pid]['multiplier'] / len(prime_data) * 100, 2)
        except Exception as e:
            print(e)
        season_eo[f['gw']] = picks_dict
    with open(season_folder / 'eo.json', 'w') as file:
        json.dump(season_eo, file)
    return


def folder_order(fname):
    # print(fname)
    if sys.platform == 'win32':
        f = [j for i in fname.split('\\') for j in i.split('/')]
    else:
        f = fname.split('/')
    item1 = int(f[2].split('-')[0])
    item2 = int(f[3].split('GW')[1])
    item3 = f[4]
    return (item1, item2, item3)


def cache_projected_points(season_folder):
    
    vals = read_static()
    season = vals['season']
    all_gw_files = glob.glob('build/data/' + season + '/*/*/input/fplreview-free-planner.csv-encrypted')
    all_gw_files.sort(key=folder_order, reverse=True)
    if sys.platform == 'win32':
        all_gw_files = [i.replace('\\', '/') for i in all_gw_files]
    list_dates = ([i.split('/')[2:5] for i in all_gw_files])
    gw_dict = dict()
    base_folder = pathlib.Path().resolve()
    tmp_folder = pathlib.Path(base_folder / "tmp/")
    tmp_folder.mkdir(parents=True, exist_ok=True)
    for date_pair in list_dates:
        gw_dict.setdefault(date_pair[1], date_pair)
    
    with open(season_folder / 'points.json', 'r') as f:
        final_points = json.load(f)

    try:
        print(final_points['1'][0])
    except:
        print("Cannot print GW1 points -- new season?")

    dataframes = []
    vertical_frames = []
    for gw in range(1,39):
        try:
            gw_rp = final_points[str(gw)]
        except KeyError:
            continue
        rp_val = {i['id']: sum(v['points'] for g in i['e'] for v in g['stats']) for i in gw_rp}
        rmin_val = {i['id']: np.average([v['value'] for g in i['e'] for v in g['stats'] if v['identifier'] == 'minutes']) for i in gw_rp}
        game_cnt = {i['id']: len(i['e']) for i in gw_rp}
        if f'GW{gw}' in gw_dict:
            val = gw_dict[f'GW{gw}']
            file_e = f'build/data/{season}/{val[1]}/{val[2]}/input/fplreview-free-planner.csv'
            print(file_e)
            decrypt(file_e, 'REVIEW_KEY')
            file_d = f'build/data/{season}/{val[1]}/{val[2]}/input/fplreview-free-planner.csv'
            new_loc = tmp_folder / f"GW{gw}.csv"
            shutil.move(file_e, tmp_folder / f"GW{gw}.csv")
            df = pd.read_csv(new_loc)
            if 'ID' not in df.columns:
                df['ID'] = df.index + 1
            if 'Price' not in df.columns:
                df['Price'] = df['BV']
            else:
                df['Price'] = df['Price']/10
            df['ID'] = df['ID'].astype(int)
            df[f'{gw}_Val'] = df['Price']
            df[f'{gw}_rp'] = df['ID'].map(rp_val).fillna(0)
            df[f'{gw}_rmin'] = df['ID'].map(rmin_val).fillna(0)
            df[f'{gw}_games'] = df['ID'].map(game_cnt).fillna(0)
            df['index'] = df['ID']
            df.set_index('index', inplace=True, drop=True)
            dataframes.append(df[[f'{gw}_Val', f'{gw}_Pts', f'{gw}_xMins', f'{gw}_rp', f'{gw}_rmin', f'{gw}_games']])
            df['gw'] = gw
            df['xp'] = df[f'{gw}_Pts']
            df['xmin'] = df[f'{gw}_xMins']
            df['price'] = df[f'{gw}_Val']
            df['rp'] = df[f'{gw}_rp']
            df['rmin'] = df[f'{gw}_rmin']
            df['games'] = df[f'{gw}_games']
            vertical_frames.append(df[['ID', 'Name', 'Team', 'Pos', 'price', 'gw', 'xp', 'xmin', 'rp', 'rmin', 'games']])
    try:
        dataframes.insert(0, df[['ID', 'Name', 'Team', 'Pos']])
    except:
        print("No df items -- new season?")

    try:
        combined = pd.concat(dataframes, axis=1)
        combined.to_csv(season_folder / f"xp_pivot.csv")
        v_combined = pd.concat(vertical_frames)
        v_combined.to_csv(season_folder / f"xp.csv")
    except:
        print("Cannot generate xp and xp_pivot files")
    

def cache_points_main():
    input_folder, output_folder, season_folder = create_folders()
    cache_projected_points(season_folder)


# TODO: fbref?

if __name__ == "__main__":
    input_folder, output_folder, season_folder = create_folders()
    generate_intermediate_layer(input_folder, page='free-planner')
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

    # input_folder, output_folder, season_folder = create_folders()
    # cache_effective_ownership(season_folder)

    # read_top_managers(1)

    # for i in range(1,12):
    #     sample_fpl_teams(i)

    # get_team_picks_from_rank([1,10,50,100], 11)

    # tv = get_team_season_review({'twitter': 'sertalpbilal', 'id': 7331}, True)
    # print(tv)

    pass
