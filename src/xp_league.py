
import requests
import json
from itertools import repeat
from concurrent.futures import ProcessPoolExecutor
import time
import pathlib

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


if __name__ == '__main__':
    get_league_ids()
    cache_league_picks()
