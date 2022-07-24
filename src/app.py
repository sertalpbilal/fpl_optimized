#!/usr/bin/python3

"""Main entry point for the web app
This file serves the dynamic content generated by flask, and also converts
these pages to static HTML.
"""

import glob
import json
import os
import sys
import datetime
from collect import get_fpl_info
from xp_league import calculate_xp_ranks
import requests

from flask import Flask, render_template, send_from_directory, jsonify
app = Flask(__name__)
app.config['FREEZER_REMOVE_EXTRA_FILES'] = False
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.config['DEBUG']=False
jinja_options = app.jinja_options.copy()
jinja_options.update(dict(
    block_start_string='"%',
    block_end_string='%"',
    variable_start_string='**',
    variable_end_string='**',
    comment_start_string='<#',
    comment_end_string='#>',
))
app.jinja_options = jinja_options

global_season = "2022-23"
current_time = str(datetime.datetime.utcnow().replace(tzinfo=datetime.timezone.utc).isoformat())
timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")

off_season = True

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

def gw_order(fname):
    if sys.platform == 'win32':
        f = [j for i in fname.split('\\') for j in i.split('/')]
    else:
        f = fname.split('/')
    item1 = int(f[2].split('-')[0])
    item2 = int(f[3].split('GW')[1])
    return (item1, item2)

@app.route('/')
def home_page():
    all_dates = glob.glob('build/data/*/GW*/*')
    all_dates.sort(key=folder_order, reverse=True)
    if sys.platform == 'win32':
        all_dates = [i.replace('\\', '/') for i in all_dates]
    target = all_dates[0].split('/')
    list_dates = ([i.split('/')[2:] for i in all_dates])
    list_dates = [' / '.join(i) for i in list_dates]
    if app.config['DEBUG']:
        return render_template('index.html', repo_name="/..", ts = timestamp, page_name="", season=target[2], gw=target[3], date=target[4], list_dates=[], last_update=current_time, no_ev=True)
    else:
        return render_template('index.html', repo_name="", ts = timestamp, page_name="", season=target[2], gw=target[3], date=target[4], list_dates=[], last_update=current_time, no_ev=True)

@app.route('/week.html')
def best_gw_squads():
    all_dates = glob.glob('build/data/*/*/*/output/no_limit_best_11.csv')
    # print(all_dates)
    all_dates.sort(key=folder_order, reverse=True)
    if sys.platform == 'win32':
        all_dates = [i.replace('\\', '/') for i in all_dates]
    target = all_dates[0].split('/')
    list_dates = ([i.split('/')[2:5] for i in all_dates])
    list_dates = [' / '.join(i) for i in list_dates]
    if app.config['DEBUG']:
        return render_template('week.html', repo_name="/..", ts = timestamp, page_name="Optimal Squads", season=target[2], gw=target[3], date=target[4], list_dates=list_dates, last_update=current_time)
    else:
        return render_template('week.html', repo_name="", ts = timestamp, page_name="Optimal Squads", season=target[2], gw=target[3], date=target[4], list_dates=list_dates, last_update=current_time)

@app.route('/puzzle.html')
def puzzle_page():
    if app.config['DEBUG']:
        return render_template('puzzle.html', repo_name="/..", ts=timestamp, page_name="FPL Puzzle", last_update=current_time, no_ev=True)
    else:
        return render_template('puzzle.html', repo_name="", ts=timestamp, page_name="FPL Puzzle", last_update=current_time, no_ev=True)


@app.route('/load.html')
def load_page():
    if app.config['DEBUG']:
        return render_template('load.html', repo_name="/..", ts=timestamp, page_name="Load Data", last_update=current_time, no_ev=True)
    else:
        return render_template('load.html', repo_name="", ts=timestamp, page_name="Load Data", last_update=current_time, no_ev=True)


# @app.route('/top_squads.html')
# def top_squads():
#     all_dates = glob.glob('build/data/*/*/*/output/iterative_model.json')
#     all_dates.sort(key=folder_order, reverse=True)
#     target = all_dates[0].split('/')
#     list_dates = ([i.split('/')[2:5] for i in all_dates])
#     list_dates = [' / '.join(i) for i in list_dates]
#     if app.config['DEBUG']:
#         return render_template('top_squads.html', repo_name="/..", season=target[2], gw=target[3], date=target[4], list_dates=list_dates)
#     else:
#         return render_template('top_squads.html', repo_name="fpl_optimized", season=target[2], gw=target[3], date=target[4], list_dates=list_dates)

@app.route('/team_summary.html')
def team_summary():
    target, list_dates, next_gw, is_active_gw, active_gw, _ = list_one_per_gw(season_filter=global_season)

    # with open('static/json/fpl_analytics.json') as f:
    #     league_list = f.read()

    with open('static/json/league.json') as f:
        league_list = f.read()

    if app.config['DEBUG']:
        return render_template('team_summary.html', repo_name="/..", ts = timestamp, page_name="GW Summary", season=target[0], gw=target[1], date=target[2], list_dates=list_dates, last_update=current_time, is_active=is_active_gw, active_gw=active_gw, next_gw=next_gw, league_list=league_list)
    else:
        return render_template('team_summary.html', repo_name="", ts = timestamp, page_name="GW Summary", season=target[0], gw=target[1], date=target[2], list_dates=list_dates, last_update=current_time, is_active=is_active_gw, active_gw=active_gw, next_gw=next_gw, league_list=league_list)


@app.route('/ownership_trend.html')
def ownership_trend():
    all_dates = glob.glob('build/data/*/*/*/input/element.csv')
    all_dates.sort(key=folder_order, reverse=True)
    if sys.platform == 'win32':
        all_dates = [i.replace('\\', '/') for i in all_dates]
    list_dates = ([i.split('/')[2:5] for i in all_dates])
    target = list_dates[0]
    list_dates = [' / '.join(i) for i in list_dates]
    if app.config['DEBUG']:
        return render_template('ownership_trend.html', repo_name="/..", ts = timestamp, page_name="Ownership Trends", season=target[0], gw=target[1], date=target[2], list_dates=list_dates, last_update=current_time, no_ev=True)
    else:
        return render_template('ownership_trend.html', repo_name="", ts = timestamp, page_name="Ownership Trends", season=target[0], gw=target[1], date=target[2], list_dates=list_dates, last_update=current_time, no_ev=True)

@app.route('/analytics_league.html')
def fpl_analytics():

    # gw = get_gw()
    target, list_dates, next_gw, is_active_gw, active_gw, all_files = list_one_per_gw(season_filter=global_season)

    # if is_active_gw == 'true':
    #     target = list_dates[0].split(' / ')
    # else:
    #     target = list_dates[1].split(' / ')

    # print(list_dates)

    # Calculate sum until now
    # season_values = calculate_xp_ranks(all_files) #target[1].strip()

    try:
        import pandas as pd
        f = sorted(glob.glob('build/data/' + global_season + '/*/*/output/xp_league_ranks.csv'), key=os.path.getctime, reverse=True)[0]
        # season_values = pd.read_csv(f, index_col=0)
        # season_values.fillna('', inplace=True)
        f = f.replace("build/", "")
        season_values = ''
        season_values_js = []
    except:
        f = ''
        season_values = calculate_xp_ranks(all_files)
        season_values_js = season_values.to_dict(orient="records")
        # season_values.to_csv("debug.csv")

    # return {"message": "It works!"}, 200

    # For regular season use
    # target = [i.strip() for i in list_dates[0].split('/')]

    target = [i.strip() for i in list_dates[0].split('/')]

    if app.config['DEBUG']:
        return render_template('analytics_xp_league.html', repo_name="/..", ts = timestamp, page_name="Analytics xP League", season=global_season, gw=target[1].strip(), date=target[2], list_dates=list_dates, last_update=current_time, season_vals=season_values_js, season_file=f)
    else:
        return render_template('analytics_xp_league.html', repo_name="", ts = timestamp, page_name="Analytics xP League", season=global_season, gw=target[1].strip(), date=target[2], list_dates=list_dates, last_update=current_time, season_vals=season_values_js, season_file=f)


@app.route('/live_gw.html')
def live_gw_page():
    page_name = 'live_gw.html'

    target, list_dates, next_gw, is_active_gw, active_gw, _ = list_one_per_gw(season_filter=global_season)

    # with open('static/json/fpl_analytics.json') as f:
    #     league_list = f.read()

    print("LIVE GW")
    print(target)
    print(list_dates)
    print(next_gw)
    print(is_active_gw)
    print(active_gw)

    with open('static/json/league.json') as f:
        league_list = f.read()

    if app.config['DEBUG']:
        return render_template(page_name, repo_name="/..", ts = timestamp, page_name="Live GW", 
            season=target[0], gw=target[1], date=target[2], list_dates=list_dates, last_update=current_time, is_active=is_active_gw, active_gw=active_gw, next_gw=next_gw, league_list=league_list)
    else:
        return render_template(page_name, repo_name="", ts = timestamp, page_name="Live GW", 
            season=target[0], gw=target[1], date=target[2], list_dates=list_dates, last_update=current_time, is_active=is_active_gw, active_gw=active_gw, next_gw=next_gw, league_list=league_list)


@app.route('/fpl_fixture.html')
def fpl_fixture_page():
    page_name = 'fpl_fixture.html'

    # target, list_dates, next_gw, is_active_gw, active_gw, _ = list_one_per_gw()
    all_dates = glob.glob('build/data/*/*/*/input/fivethirtyeight_spi.csv')
    all_dates.sort(key=folder_order, reverse=True)
    if sys.platform == 'win32':
        all_dates = [i.replace('\\', '/') for i in all_dates]
    list_dates = ([i.split('/')[2:5] for i in all_dates])
    target = list_dates[0]

    data_target = '/'.join(all_dates[0].split('/')[1:])

    if app.config['DEBUG']:
        return render_template(page_name, repo_name="/..", ts = timestamp, page_name="FPL Fixture", 
            season=target[0], gw=target[1], date=target[2], data_target=data_target, last_update=current_time, no_ev=True)
    else:
        return render_template(page_name, repo_name="", ts = timestamp, page_name="FPL Fixture", 
            season=target[0], gw=target[1], date=target[2], data_target=data_target, last_update=current_time, no_ev=True)


# @app.route('/player_stats.html')
# def player_stats_page():
#     page_name = 'player_stats.html'

#     all_seasons = glob.glob('build/data/*')
#     if sys.platform == 'win32':
#         all_seasons = [i.replace('\\', '/') for i in all_seasons]
#     season = all_seasons[0].split('/')[2]
#     print(season)

#     if app.config['DEBUG']:
#         return render_template(page_name, repo_name="/..", page_name="Player Stats", 
#             season=season, last_update=current_time)
#     else:
#         return render_template(page_name, repo_name="", page_name="Player Stats", 
#             season=season, last_update=current_time)


@app.route('/spirit_team.html')
def spirit_team_page():
    page_name = 'spirit_team.html'

    all_weeks = glob.glob('build/data/*/GW*/')
    if sys.platform == 'win32':
        all_weeks = [i.replace('\\', '/') for i in all_weeks]
    all_weeks.sort(key=gw_order, reverse=True)
    s = all_weeks[0].split('/')
    # print(s)
    season = s[2]
    gw = s[3]
    

    if app.config['DEBUG']:
        return render_template(page_name, repo_name="/..", ts = timestamp, page_name="Spirit Team", 
            season=season, gw=gw, last_update=current_time, no_ev=True)
    else:
        return render_template(page_name, repo_name="", ts = timestamp, page_name="Spirit Team", 
            season=season, gw=gw, last_update=current_time, no_ev=True)


# @app.route('/manager_form.html')
# def manager_form():
#     page_name = 'manager_form.html'

#     all_weeks = glob.glob('build/data/*/*/')
#     if sys.platform == 'win32':
#         all_weeks = [i.replace('\\', '/') for i in all_weeks]
#     all_weeks.sort(key=gw_order, reverse=True)
#     s = all_weeks[0].split('/')
#     print(s)
#     season = s[2]
#     gw = s[3]
    

#     if app.config['DEBUG']:
#         return render_template(page_name, repo_name="/..", page_name="Manager Form", 
#             season=season, gw=gw, last_update=current_time)
#     else:
#         return render_template(page_name, repo_name="", page_name="Manager Form", 
#             season=season, gw=gw, last_update=current_time)



@app.route('/ownership_rates.html')
def ownership_rates():
    page_name = 'ownership_rates.html'

    # all_weeks = glob.glob('build/data/*/*')
    # if sys.platform == 'win32':
    #     all_weeks = [i.replace('\\', '/') for i in all_weeks]
    # all_weeks.sort(key=gw_order, reverse=True)
    # s = all_weeks[0].split('/')
    # print(s)
    # season = s[2]
    # gw = s[3]

    target, list_dates, next_gw, is_active_gw, active_gw, _ = list_one_per_gw(season_filter=global_season)
    if len(list_dates) > 1:
        dates = [list_dates[1]]
    else:
        dates = [list_dates[0]]
    
    if app.config['DEBUG']:
        return render_template(page_name, repo_name="/..", ts = timestamp, page_name="Ownership Rates", 
            season=target[0], gw=target[1], list_dates=dates, next_gw=next_gw, last_update=current_time, no_ev=True)
    else:
        return render_template(page_name, repo_name="", ts = timestamp, page_name="Ownership Rates", 
            season=target[0], gw=target[1], list_dates=dates, next_gw=next_gw, last_update=current_time, no_ev=True)


@app.route('/impact_summary.html')
def impact_summary_page():
    page_name = 'impact_summary.html'

    # all_weeks = glob.glob('build/data/*/*')
    # if sys.platform == 'win32':
    #     all_weeks = [i.replace('\\', '/') for i in all_weeks]
    # all_weeks.sort(key=gw_order, reverse=True)
    # s = all_weeks[0].split('/')
    # print(s)
    # season = s[2]
    # gw = s[3]

    target, list_dates, next_gw, is_active_gw, active_gw, _ = list_one_per_gw(season_filter=global_season)
    if len(list_dates) > 1:
        dates = [list_dates[1]]
    else:
        dates = [list_dates[0]]
    
    if app.config['DEBUG']:
        return render_template(page_name, repo_name="/..", ts = timestamp, page_name="Impact Summary", 
            season=target[0], gw=target[1], list_dates=dates, next_gw=next_gw, last_update=current_time, no_ev=True)
    else:
        return render_template(page_name, repo_name="", ts = timestamp, page_name="Impact Summary", 
            season=target[0], gw=target[1], list_dates=dates, next_gw=next_gw, last_update=current_time, no_ev=True)


@app.route('/highlights.html')
def highlights():
    page_name = 'highlights.html'

    target, list_dates, next_gw, is_active_gw, active_gw, _ = list_one_per_gw(season_filter=global_season)

    print(next_gw)

    # with open('static/json/fpl_analytics.json') as f:
    #     league_list = f.read()

    gw = target[1].split('GW')[1]
    gw = '39' if off_season else gw

    if app.config['DEBUG']:
        return render_template(page_name, repo_name="/..", ts = timestamp, page_name="Season Highlights", season=target[0], gw=gw, off_season=off_season)
            # season=target[0], gw=target[1], date=target[2], list_dates=list_dates, last_update=current_time, is_active=is_active_gw, active_gw=active_gw, next_gw=next_gw, league_list=league_list)
    else:
        return render_template(page_name, repo_name="", ts = timestamp, page_name="Season Highlights", season=target[0], gw=gw, off_season=off_season)
            # season=target[0], gw=target[1], date=target[2], list_dates=list_dates, last_update=current_time, is_active=is_active_gw, active_gw=active_gw, next_gw=next_gw, league_list=league_list)


# @app.route('/country_stats.html')
# def country_stats():
#     page_name = 'country_stats.html'

#     target, list_dates, next_gw, is_active_gw, active_gw, _ = list_one_per_gw()

#     print(next_gw)
#     import pandas as pd

#     country_data = glob.glob(f"build/data/{global_season}/main/*/country_league_sizes.csv")
#     cdf = pd.read_csv(country_data[0])

#     gw = target[1].split('GW')[1]

#     if app.config['DEBUG']:
#         return render_template(page_name, repo_name="/..", page_name="Country Stats", season=target[0], gw=gw, country_data=cdf.to_dict(orient='records'))
#     else:
#         return render_template(page_name, repo_name="", page_name="Country Stats", season=target[0], gw=gw, country_data=cdf.to_dict(orient='records'))


@app.route('/calculator.html')
def calculator_page():
    page_name = 'calculator.html'

    if app.config['DEBUG']:
        return render_template(page_name, repo_name="/..", ts = timestamp, page_name="FPL Expected Points Calculator", no_ev=True)
    else:
        return render_template(page_name, repo_name="", ts = timestamp, page_name="FPL Expected Points Calculator", no_ev=True)


@app.route('/test.html')
def test_page():
    page_name = 'test.html'

    if app.config['DEBUG']:
        return render_template(page_name, repo_name="/..", last_update = current_time, page_name="Test Page", no_ev=True)
    else:
        return render_template(page_name, repo_name="", last_update = current_time, page_name="Test Page", no_ev=True)


@app.route('/history.html')
def history_page():
    page_name = 'history.html'

    files = glob.glob("build/data/*/points.json")
    seasons = [i.split('/')[2] for i in files]
    seasons.reverse()

    if app.config['DEBUG']:
        return render_template(page_name, repo_name="/..", last_update = current_time, page_name="FPL Player Point History", seasons=seasons, no_ev=True)
    else:
        return render_template(page_name, repo_name="", last_update = current_time, page_name="FPL Player Point History", seasons=seasons, no_ev=True)



@app.route('/who_played.html')
def who_played():
    page_name = 'who_played.html'

    target, list_dates, next_gw, is_active_gw, active_gw, _ = list_one_per_gw()

    r = requests.get("https://fantasy.premierleague.com/api/bootstrap-static/")
    vals = r.json()
    elements = vals['elements']

    gw = target[1].split('GW')[1]

    if app.config['DEBUG']:
        return render_template(page_name, repo_name="/..", ts = timestamp, page_name="Who Played", season=target[0], gw=gw, gameweeks=list(range(1,int(gw)+1)), elements=json.dumps(elements), no_ev=True)
            # season=target[0], gw=target[1], date=target[2], list_dates=list_dates, last_update=current_time, is_active=is_active_gw, active_gw=active_gw, next_gw=next_gw, league_list=league_list)
    else:
        return render_template(page_name, repo_name="", ts = timestamp, page_name="Who Played", season=target[0], gw=gw, gameweeks=list(range(1,int(gw)+1)), elements=json.dumps(elements), no_ev=True)


@app.route('/scenarios.html')
def scenario_page():
    page_name = 'scenarios.html'

    # Raw input data
    # files = glob.glob(f"build/data/{global_season}/GW*/*/input/detailed-fplreview-*.csv-encrypted")
    # files = sorted(files, key=os.path.getctime, reverse=True)
    # files = ['/'.join(i.split('/')[1:]) for i in files]

    # Scenario outputs
    files = glob.glob(f"build/data/{global_season}/GW*/*/output/scenarios.csv")
    files = sorted(files, key=os.path.getctime, reverse=True)
    if sys.platform == 'win32':
        files = [i.replace('\\', '/') for i in files]
    files = [i.split('/')[1:] for i in files]
    file_dict = {}
    for f in files:
        if f[2] in file_dict:
            continue
        else:
            file_dict[f[2]] = "/".join(f)

    files = list(file_dict.items())
    print(files)
    files = sorted(files, key=lambda k: int(k[0].split('GW')[1]))
    files.reverse()
    # '/'.join

    if app.config['DEBUG']:
        return render_template(page_name, repo_name="/..", ts = timestamp, season=files[0][1].split('/')[1], gw=files[0][0], page_name="Scenarios", sc_files=files)
    else:
        return render_template(page_name, repo_name="", ts = timestamp, season=files[0][1].split('/')[1], gw=files[0][0], page_name="Scenarios", sc_files=files)

def list_all_snapshots():
    pass

def list_one_per_gw(season_filter='*'):

    is_active_gw = 'false'
    active_gw = -1
    data = get_fpl_info('now')
    gws = [i for i in data['events'] if i['is_current'] == True]
    if len(gws) == 1:
        if gws[0]['finished'] == False:
            is_active_gw = 'true'
            active_gw = gws[0]['id']

    all_dates = glob.glob('build/data/' + season_filter + '/*/*/input/fplreview-free-planner.csv-encrypted')
    all_dates.sort(key=folder_order, reverse=True)
    if sys.platform == 'win32':
        all_dates = [i.replace('\\', '/') for i in all_dates]
    list_dates = ([i.split('/')[2:5] for i in all_dates])

    filtered_dates = []
    exist = set()
    for i in list_dates:
        if i[1] not in exist:
            filtered_dates.append(i)
            exist.add(i[1])
    # filtered_dates.pop(0)
    target = filtered_dates[0]
    next_gw = target[1]
    if active_gw != -1:
        for i in filtered_dates:
            if f"GW{active_gw}" == i[1]:
                target = i
                print(f"Active GW {active_gw}")
    list_dates = [' / '.join(i) for i in filtered_dates]
    return target, list_dates, next_gw, is_active_gw, active_gw, filtered_dates

@app.route('/data/<path:path>')
def read_data(path):
    # print(path)
    return send_from_directory('build', 'data/' + path)

@app.route('/sample/<path:path>')
def read_sample(path):
    # print(path)
    return send_from_directory('build', 'sample/' + path)


def get_gw():
    import requests
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
    return gw


if __name__ == "__main__":
    app.config['DEBUG']=True
    from app import app
    app.run(host='0.0.0.0', port=5000, debug=True)


