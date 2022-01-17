
from pyexpat.model import XML_CTYPE_MIXED
import requests
import json
from itertools import repeat
from concurrent.futures import ProcessPoolExecutor
import time
import pathlib
import pandas as pd
from encrypt import read_encrypted
import os
import io

def read_static():
    base_folder = pathlib.Path().resolve()
    with open(base_folder / 'static-values.json') as f:
        data = json.load(f)
    return data

def get_league_ids():
    league_id = "31936"
    teams = []
    has_next = True
    page = 1
    while has_next:
        print(page)
        r = requests.get(f"https://fantasy.premierleague.com/api/leagues-classic/{league_id}/standings/?page_standings={page}")
        has_next = r.json()['standings']['has_next']
        teams.extend([i for i in r.json()['standings']['results']])
        page = r.json()['standings']['page'] + 1
        print(len(teams))
    
    with open('build/static/json/league.json', 'w') as f:
        json.dump(teams, f)

    print(f"Total: {len(teams)} teams")


def get_team_picks(team_info, gw):
    time.sleep(0.5)
    tid = team_info['entry']
    print(f"Requesting {team_info['player_name']} {gw}")
    r = requests.get(f"https://fantasy.premierleague.com/api/entry/{tid}/event/{gw}/picks/")
    if r.status_code == 200:
        print(f"Completed {team_info['player_name']} {gw}")
        return r.json()
    else:
        print(f"*** Error: {r.status_code} for {team_info['player_name']} {gw}")
        return None


def cache_league_picks():

    env = read_static()
    season = env['season']

    r = requests.get("https://fantasy.premierleague.com/api/bootstrap-static/")
    vals = r.json()
    gw = 38
    for i in vals['events']:
        if i['is_current']:
            gw = i['id']
            break
        elif i['is_next']:
            gw = i['id']
            break

    with open('build/static/json/league.json') as f:
        teams = json.load(f)

    with ProcessPoolExecutor(max_workers=8) as executor:
        picks = list(executor.map(get_team_picks, teams, repeat(gw)))

    combined = list(zip(teams, picks))

    base_folder = pathlib.Path().resolve()
    input_folder = pathlib.Path(base_folder / f"build/sample/{season}/{gw}/")
    input_folder.mkdir(parents=True, exist_ok=True)

    with open(input_folder / 'analytics_league.json', 'w') as file:
        json.dump(combined, file)


def calculate_xp_ranks(element_locations):

    gw_dates = reversed(element_locations)
    data_dict = {}
    gw_max = None
    for i in gw_dates:
        season = i[0]
        gw = i[1]
        gw_numeric = int(gw.split("GW")[1])
        date = i[2]

        if not os.path.exists(f"build/sample/{season}/{gw_numeric}/analytics_league.json"):
            continue

        gw_max = gw_numeric

        # get elements
        elements = pd.read_csv(f"build/data/{season}/{gw}/{date}/input/element.csv")
        raw_data = read_encrypted(f"build/data/{season}/{gw}/{date}/input/fplreview-free-planner.csv", "REVIEW_KEY")
        player_xp  = pd.read_csv(io.BytesIO(raw_data))
        with open(f"build/sample/{season}/{gw_numeric}/analytics_league.json", "r") as f:
            manager_picks = json.load(f)
        data_dict[gw_numeric] = {'elements': elements, 'xp': player_xp, 'picks': manager_picks}

    # with open(f"build/data/{season}/points.json", "r") as f:
    #     points_data = json.load(f)

    # points_dict = {}
    # for week in points_data:
    #     w = points_dict[week] = {}
    #     for player in points_data[week]:
    #         p = 0
    #         for game in player['e']:
    #             for stats in game.get('stats', []):
    #                 p += stats['points']
    #         w[player['id']] = p

    fixed_bench_weights = [0.03, 0.21, 0.06, 0.002]
    fixed_chip_weights = {'freehit': 18, 'wildcard': 20, 'bboost': 12, '3xc': 15}

    # Calculate weekly and total xP
    results = []
    for gw in range(1, gw_max+1):
        week_data = data_dict[gw]
        xp_data = week_data['xp']
        xp_data.index = xp_data.index + 1
        xp_dict = xp_data[f"{gw}_Pts"].to_dict()
        for manager in week_data['picks']:
            manager_week_sum = 0
            manager_week_obj = 0
            if manager[1] is None: # Deleted?
                continue
            for player in manager[1]['picks']:
                try:
                    manager_week_sum += xp_dict[int(player['element'])] * player['multiplier']
                    manager_week_obj += xp_dict[int(player['element'])] * player['multiplier']
                    if player['multiplier'] == 0 and player['order'] > 11: # bench
                        manager_week_obj += xp_dict[int(player['element'])] * fixed_bench_weights[player['order']-11-1]
                except KeyError:
                    # print(f"Player {player['element']} is not in xP data")
                    pass
            chip = manager[1]['active_chip']
            if chip == None:
                chip = ''
            else:
                manager_week_obj -= fixed_chip_weights[chip]
            manager_week_obj += (manager[1]['entry_history']['bank'] / 10) * 0.1
            manager_week_sum -= manager[1]['entry_history']['event_transfers_cost']
            manager_week_obj -= manager[1]['entry_history']['event_transfers_cost']
            results.append({
                'gw': gw,
                'entry': manager[0]['entry'],
                'id': manager[0]['id'],
                'entry_name': manager[0]['entry_name'],
                'player_name': manager[0]['player_name'],
                'week_sum': manager_week_sum,
                'week_obj': manager_week_obj,
                'chip': chip,
                'chip_gw': '' if chip == '' else str(gw),
                'total_pts': manager[0]['total'],
                'last_rank': manager[1]['entry_history']['overall_rank']
                })

    results_df = pd.DataFrame(results)
    results_df['season_sum'] = results_df.groupby(['entry'])['week_sum'].apply(lambda x: x.cumsum())
    results_df['obj_sum'] = results_df.groupby(['entry'])['week_obj'].apply(lambda x: x.cumsum())
    results_df['chip_sum'] = results_df.groupby(['entry'])['chip'].apply(lambda x: (x.astype(str) + ' ').cumsum().str.split()).apply(lambda x: ' '.join(x))
    results_df['chip_gws'] = results_df.groupby(['entry'])['chip_gw'].apply(lambda x: (x.astype(str) + ' ').cumsum().str.split()).apply(lambda x: ' '.join(x))
    sorted_df = results_df.sort_values(by=['gw', 'season_sum'], ascending=[False, False]).reset_index(drop=True)

    return sorted_df


if __name__ == '__main__':
    get_league_ids()
    cache_league_picks()
