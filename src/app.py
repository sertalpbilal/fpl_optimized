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

from flask import Flask, render_template, send_from_directory
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

current_time = str(datetime.datetime.utcnow().replace(tzinfo=datetime.timezone.utc).isoformat())

def folder_order(fname):
    if sys.platform == 'win32':
        f = [j for i in fname.split('\\') for j in i.split('/')]
    else:
        f = fname.split('/')
    item1 = int(f[2].split('-')[0])
    item2 = int(f[3].split('GW')[1])
    item3 = f[4]
    return (item1, item2, item3)

@app.route('/')
def home_page():
    all_dates = glob.glob('build/data/*/*/*')
    all_dates.sort(key=folder_order, reverse=True)
    target = all_dates[0].split('/')
    list_dates = ([i.split('/')[2:] for i in all_dates])
    list_dates = [' / '.join(i) for i in list_dates]
    if app.config['DEBUG']:
        return render_template('index.html', repo_name="..", page_name="", season=target[2], gw=target[3], date=target[4], list_dates=[], last_update=current_time)
    else:
        return render_template('index.html', repo_name="fpl_optimized", page_name="", season=target[2], gw=target[3], date=target[4], list_dates=[], last_update=current_time)

@app.route('/week.html')
def best_gw_squads():
    all_dates = glob.glob('build/data/*/*/*/output/no_limit_best_11.csv')
    # print(all_dates)
    all_dates.sort(key=folder_order, reverse=True)
    target = all_dates[0].split('/')
    list_dates = ([i.split('/')[2:5] for i in all_dates])
    list_dates = [' / '.join(i) for i in list_dates]
    if app.config['DEBUG']:
        return render_template('week.html', repo_name="..", page_name="Optimal Squads", season=target[2], gw=target[3], date=target[4], list_dates=list_dates, last_update=current_time)
    else:
        return render_template('week.html', repo_name="fpl_optimized", page_name="Optimal Squads", season=target[2], gw=target[3], date=target[4], list_dates=list_dates, last_update=current_time)

# @app.route('/top_squads.html')
# def top_squads():
#     all_dates = glob.glob('build/data/*/*/*/output/iterative_model.json')
#     all_dates.sort(key=folder_order, reverse=True)
#     target = all_dates[0].split('/')
#     list_dates = ([i.split('/')[2:5] for i in all_dates])
#     list_dates = [' / '.join(i) for i in list_dates]
#     if app.config['DEBUG']:
#         return render_template('top_squads.html', repo_name="..", season=target[2], gw=target[3], date=target[4], list_dates=list_dates)
#     else:
#         return render_template('top_squads.html', repo_name="fpl_optimized", season=target[2], gw=target[3], date=target[4], list_dates=list_dates)

@app.route('/team_summary.html')
def team_summary():
    target, list_dates, next_gw, is_active_gw, active_gw = list_one_per_gw()

    with open('static/json/fpl_analytics.json') as f:
        league_list = f.read()

    if app.config['DEBUG']:
        return render_template('team_summary.html', repo_name="..", page_name="GW Summary", season=target[0], gw=target[1], date=target[2], list_dates=list_dates, last_update=current_time, is_active=is_active_gw, active_gw=active_gw, next_gw=next_gw, league_list=league_list)
    else:
        return render_template('team_summary.html', repo_name="fpl_optimized", page_name="GW Summary", season=target[0], gw=target[1], date=target[2], list_dates=list_dates, last_update=current_time, is_active=is_active_gw, active_gw=active_gw, next_gw=next_gw, league_list=league_list)


@app.route('/ownership_trend.html')
def ownership_trend():
    all_dates = glob.glob('build/data/*/*/*/input/element.csv')
    all_dates.sort(key=folder_order, reverse=True)
    list_dates = ([i.split('/')[2:5] for i in all_dates])
    target = list_dates[0]
    list_dates = [' / '.join(i) for i in list_dates]
    if app.config['DEBUG']:
        return render_template('ownership_trend.html', repo_name="..", page_name="Ownership Trends", season=target[0], gw=target[1], date=target[2], list_dates=list_dates, last_update=current_time)
    else:
        return render_template('ownership_trend.html', repo_name="fpl_optimized", page_name="Ownership Trends", season=target[0], gw=target[1], date=target[2], list_dates=list_dates, last_update=current_time)


@app.route('/fpl_analytics_league.html')
def fpl_analytics():
    all_dates = glob.glob('build/data/*/*/*/input/fpl_analytics_league.csv')
    all_dates.sort(key=folder_order, reverse=True)
    list_dates = ([i.split('/')[2:5] for i in all_dates])
    target = list_dates[0]
    list_dates = [' / '.join(i) for i in list_dates]
    if app.config['DEBUG']:
        return render_template('fpl_analytics_league.html', repo_name="..", page_name="Analytics League", season=target[0], gw=target[1], date=target[2], list_dates=list_dates, last_update=current_time)
    else:
        return render_template('fpl_analytics_league.html', repo_name="fpl_optimized", page_name="Analytics League", season=target[0], gw=target[1], date=target[2], list_dates=list_dates, last_update=current_time)

@app.route('/live_gw.html')
def live_gw_page():
    page_name = 'live_gw.html'

    target, list_dates, next_gw, is_active_gw, active_gw = list_one_per_gw()

    with open('static/json/fpl_analytics.json') as f:
        league_list = f.read()

    if app.config['DEBUG']:
        return render_template(page_name, repo_name="..", page_name="Live GW", 
            season=target[0], gw=target[1], date=target[2], list_dates=list_dates, last_update=current_time, is_active=is_active_gw, active_gw=active_gw, next_gw=next_gw, league_list=league_list)
    else:
        return render_template(page_name, repo_name="fpl_optimized", page_name="Live GW", 
            season=target[0], gw=target[1], date=target[2], list_dates=list_dates, last_update=current_time, is_active=is_active_gw, active_gw=active_gw, next_gw=next_gw, league_list=league_list)


def list_all_snapshots():
    pass

def list_one_per_gw():

    is_active_gw = 'false'
    active_gw = -1
    data = get_fpl_info('now')
    gws = [i for i in data['events'] if i['is_current'] == True]
    if len(gws) == 1:
        if gws[0]['finished'] == False:
            is_active_gw = 'true'
            active_gw = gws[0]['id']

    all_dates = glob.glob('build/data/*/*/*/input/*planner.csv')
    all_dates.sort(key=folder_order, reverse=True)
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
    return target, list_dates, next_gw, is_active_gw, active_gw

@app.route('/data/<path:path>')
def read_data(path):
    print(path)
    return send_from_directory('build', 'data/' + path)

@app.route('/sample/<path:path>')
def read_sample(path):
    print(path)
    return send_from_directory('build', 'sample/' + path)

if __name__ == "__main__":
    app.config['DEBUG']=True
    from app import app
    app.run(host='0.0.0.0', port=5000, debug=True)


