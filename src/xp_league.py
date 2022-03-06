import requests
import json
from itertools import repeat
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
import time
import pathlib
import pandas as pd
import numpy as np
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
    try:
        r = requests.get(f"https://fantasy.premierleague.com/api/entry/{tid}/event/{gw}/picks/")
    except:
        print("Connection error")
        return None
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



def cache_xp_ranks(output_folder):
    from app import list_one_per_gw
    env = read_static()
    season = env['season']

    _, _, _, _, _, all_files = list_one_per_gw(season_filter=season)
    season_values = calculate_xp_ranks(all_files)

    season_values.to_csv(output_folder / "xp_league_ranks.csv")


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

        try:
            scenarios = pd.read_csv(f"build/data/{season}/{gw}/{date}/output/scenarios.csv")
        except:
            scenarios = None

        data_dict[gw_numeric] = {'elements': elements, 'xp': player_xp, 'picks': manager_picks, 'scenarios': scenarios}

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
        sim_data = week_data['scenarios']
        if sim_data is not None:
            grouped_sim_data = [y.set_index(['ID'])[['Points', 'Minutes']].to_dict(orient='index') for x,y in sim_data.groupby('sim', as_index=False)]
        else:
            grouped_sim_data = None
        elements = week_data['elements']
        for manager in week_data['picks']:
            manager_week_sum = 0
            manager_week_obj = 0
            if manager[1] is None: # Deleted?
                continue
            p_picks = manager[1]['picks']
            for player in p_picks:
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
            # Simulate week
            if grouped_sim_data is not None:
                print(f"GW{gw} Manager {manager[0]['entry']}")
                simulation_quartile = simulate(p_picks, grouped_sim_data, elements)
                for v in simulation_quartile:
                    simulation_quartile[v] -= manager[1]['entry_history']['event_transfers_cost']
            else:
                simulation_quartile = {}

            results.append({
                'gw': gw,
                'entry': manager[0]['entry'],
                'id': manager[0]['id'],
                'entry_name': manager[0]['entry_name'],
                'player_name': manager[0]['player_name'],
                'week_sum': round(manager_week_sum,2),
                'week_obj': round(manager_week_obj,2),
                'chip': chip,
                'chip_gw': '' if chip == '' else str(gw),
                'total_pts': manager[0]['total'],
                'last_rank': manager[1]['entry_history']['overall_rank'],
                # 'sim_stats': ' '.join([str(i) for i in simulation_quartile])
                **simulation_quartile
                })

    results_df = pd.DataFrame(results)
    results_df['season_sum'] = results_df.groupby(['entry'])['week_sum'].apply(lambda x: x.cumsum())
    results_df['obj_sum'] = results_df.groupby(['entry'])['week_obj'].apply(lambda x: x.cumsum())
    results_df['sim_mean_sum'] = results_df.groupby(['entry'])['sim_mean'].apply(lambda x: x.cumsum())
    results_df['chip_sum'] = results_df.groupby(['entry'])['chip'].apply(lambda x: (x.astype(str) + ' ').cumsum().str.split()).apply(lambda x: ' '.join(x))
    results_df['chip_gws'] = results_df.groupby(['entry'])['chip_gw'].apply(lambda x: (x.astype(str) + ' ').cumsum().str.split()).apply(lambda x: ' '.join(x))
    sorted_df = results_df.sort_values(by=['gw', 'season_sum'], ascending=[False, False]).reset_index(drop=True)

    return sorted_df


def simulate(picks, player_dicts, elements):
    # TODO: effective points?
    el_types = elements[['id', 'element_type']].set_index('id')['element_type'].to_dict()

    for p in picks:
        p['pos'] = el_types[p['element']]

    # sim_numbers = data['sim'].unique().tolist()
    sim_scores = []

    # p_dict = data[data['sim'] == sim].set_index(['ID'])[['Points', 'Minutes']].to_dict(orient='index')
    # player_dicts = [p_dict.copy() for sim in sim_numbers]
    # player_dicts = [y.set_index(['ID'])[['Points', 'Minutes']].to_dict(orient='index') for x,y in data.groupby('sim', as_index=False)]
    # picks_dicts = [picks.copy() for _ in range(len(player_dicts))]
    
    # with ThreadPoolExecutor(max_workers=20) as executor:
    #     sim_scores = list(executor.map(single_sim, player_dicts, picks_dicts))  # sim, data, picks, el_types

    sim_scores = [single_sim(i, picks.copy()) for i in player_dicts]

    quartiles = np.percentile(sim_scores, [25,50,75])
    
    return {'sim_min': min(sim_scores), 'sim_q25': round(quartiles[0],2), 'sim_q50': round(quartiles[1],2), 'sim_q75': round(quartiles[2],2), 'sim_max': max(sim_scores), 'sim_mean': round(np.mean(sim_scores),2)}


def single_sim(player_dict, picks):

    playing_count = {1:0, 2:0, 3:0, 4:0}
    min_pos = {1:1, 2:3, 3:2, 4:1}
    max_pos = {1:1, 2:5, 3:5, 4:3}

    # for sim in sim_numbers:
    sim_score = 0

    for p in picks:
        if player_dict.get(p['element']) is None and p['multiplier'] > 0: # Not played - autosub!
            p['played'] = False
            p['autosub_out'] = True
            p['lineup'] = False
            p['f_multiplier'] = 0
        elif player_dict.get(p['element']) is None and p['multiplier'] == 0:
            p['played'] = False
            p['lineup'] = False
            p['f_multiplier'] = 0
        elif p['multiplier'] == 0:
            p['played'] = True
            p['lineup'] = False
            p['f_multiplier'] = 0
        else:
            p['played'] = True
            p['lineup'] = True
            p['f_multiplier'] = p['multiplier']
            playing_count[p['pos']] += 1
            
    players_out = [p for p in picks if p.get('autosub_out')]
    for p_out in players_out:
        pos = p_out['pos']

        if playing_count[pos] < min_pos[pos]: # same type
            def filter1(i):
                return i['pos'] == pos and i['played'] == True and i['lineup'] == False
            replacement = next(filter(filter1, picks), None)
            if replacement:
                replacement['lineup'] = True
                replacement['f_multiplier'] = 1
                playing_count[pos] += 1
            else: # no replacement
                continue
        else: # next player
            def filter2(i):
                return i['played'] == True and i['lineup'] == False and playing_count[i['pos']] < max_pos[i['pos']]
            replacement = next(filter(filter2, picks), None)
            if replacement:
                replacement['lineup'] = True
                replacement['f_multiplier'] = 1
                playing_count[pos] += 1
            else: # no replacement
                continue
        if p_out['is_captain']:
            def filter3(i):
                return i['is_vice_captain'] == True and i['played'] == True
            vice_captain = next(filter(filter3, picks), None)
            if vice_captain:
                vice_captain['f_multiplier'] = p_out['multiplier'] # could be TC!
    # now we should all players done
    sim_score = sum([i['f_multiplier'] * player_dict.get(i['element'], {'Points': 0})['Points'] for i in picks])
    return sim_score # sim_scores.append(sim_score)



if __name__ == '__main__':
    get_league_ids()
    cache_league_picks()
