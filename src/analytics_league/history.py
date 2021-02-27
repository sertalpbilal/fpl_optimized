#!/usr/bin/python3

import itertools
import json
import time
import random

from analytics_league.utils import read_league_teams, get_current_gw, save_to_json
from collect import get_fpl_info, FPL_API
from concurrent.futures import ProcessPoolExecutor
from urllib.request import urlopen


def get_team_picks(team, gw):
    return get_fpl_info('picks', PID=team, GW=gw)


def get_team_history(team, start, end):
    if start is None:
        start = 1
    gw_range = range(start, end+1)
    with ProcessPoolExecutor(max_workers=8) as executor:
        picks = list(executor.map(get_team_picks, itertools.repeat(team), gw_range))

    transfers = get_fpl_info('transfers', PID=team)
    history = get_fpl_info('history', PID=team)
    return {'picks': picks, 'transfers': transfers, 'history': history}


def get_analytics_league_history():
    '''
    Returns all squad picks, transfer, and chip history for Analytics League teams
    '''
    teams = read_league_teams()
    last_gw = get_current_gw()

    for team in teams:
        print(team)
        team.update(get_team_history(team=team['id'], start=None, end=last_gw))
    
    return teams



def get_only_team_history(team):
    history = get_fpl_info('history', PID=team)
    return {'id': team, 'history': history}


def get_rank_n_player(rank):
    page = ((rank-1)//50)+1
    order = (rank-1) % 50
    print(f"Fetching rank {rank}")
    try:
        with urlopen(FPL_API['overall'].format(LID=314, P=page)) as url:
            page_data = json.loads(url.read().decode())
        tid = page_data['standings']['results'][order]['entry']
        print(f"Done {rank}")
        return get_only_team_history(tid)
    except:
        print("Encountered page access error, waiting 5 seconds")
        time.sleep(5)
        print(f"Error {rank}")
        return None


def sample_within_range():

    target = 1000000
    nsample = 5000

    player_targets = random.sample(range(1, target+1), nsample)
    with ProcessPoolExecutor(max_workers=16) as executor:
        results = list(executor.map(get_rank_n_player, player_targets))
    fetched_history = [i for i in results if i is not None]
    return fetched_history


if __name__ == '__main__':
    # h = get_analytics_league_history()
    # save_to_json('history.json', h)

    h = sample_within_range()
    save_to_json('history.json', h)
