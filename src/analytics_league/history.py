#!/usr/bin/python3

import itertools

from analytics_league.utils import read_league_teams, get_current_gw, save_to_json
from collect import get_fpl_info
from concurrent.futures import ProcessPoolExecutor


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

if __name__ == '__main__':
    h = get_analytics_league_history()
    save_to_json('history.json', h)
