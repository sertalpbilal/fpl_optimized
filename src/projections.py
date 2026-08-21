#!/usr/bin/python3
"""Fetches projected points from the Solio Analytics API and converts them
into the projection CSV format consumed by the rest of the pipeline.

The output matches the layout that used to be uploaded by hand:

    Pos,ID,Name,BV,SV,Team,{gw}_xMins,...,{gw}_Pts,...

Only `ID`, `{gw}_Pts` and `{gw}_xMins` are read by `collect.py`; the remaining
columns come from the FPL API so the file stays usable on its own.

Both the endpoint and the token are private and come from the environment
(SOLIO_API_URL and SOLIO_TOKEN), set as repository secrets in CI and in a
local .env otherwise.

Usage:
  python3 projections.py                    # fetch the default horizon
  python3 projections.py --gameweeks 8      # longer horizon
  python3 projections.py --out /tmp/proj    # write somewhere else
"""

import argparse
import json
import os
import pathlib
import sys
from urllib.request import urlopen

import pandas as pd
import requests

FPL_BOOTSTRAP = "https://fantasy.premierleague.com/api/bootstrap-static/"

# Number of gameweeks published on the free tier
DEFAULT_HORIZON = 5

POSITION_MAP = {1: 'G', 2: 'D', 3: 'M', 4: 'F'}
POSITION_NAME_MAP = {'GKP': 'G', 'DEF': 'D', 'MID': 'M', 'FWD': 'F'}


def read_static():
    """Reads user-specified static values from JSON file"""
    base_folder = pathlib.Path(__file__).parent
    with open(base_folder / 'static-values.json') as f:
        return json.load(f)


def get_token(token=None):
    """Resolves the API token from the argument or the environment"""
    token = token or os.environ.get('SOLIO_TOKEN')
    if not token:
        raise RuntimeError(
            "No API token: pass --token or set the SOLIO_TOKEN environment variable")
    return token


def get_api_url(url=None):
    """Resolves the projections endpoint from the argument or the environment

    The endpoint is not public, so it is kept out of the repository and
    supplied through SOLIO_API_URL or SOLIO_ENDPOINT (a repository secret in
    CI, .env locally). Any query string on the value is dropped, since the
    request parameters are built here.
    """
    url = url or os.environ.get('SOLIO_API_URL') or os.environ.get('SOLIO_ENDPOINT')
    if not url:
        raise RuntimeError(
            "No API URL: pass --url or set the SOLIO_API_URL environment variable")
    return url.split('?')[0]


def fetch_projections(gameweeks=DEFAULT_HORIZON, token=None, url=None):
    """Reads raw projections from the Solio API"""
    headers = {'Authorization': f'Bearer {get_token(token)}'}
    params = {'details': 1, 'gameweeks': gameweeks}
    r = requests.get(get_api_url(url), headers=headers, params=params, timeout=120)
    r.raise_for_status()
    data = r.json()
    if not data.get('players'):
        raise RuntimeError("API returned no players")
    print(f"Fetched projections for GW{data['gameweeks'][0]}"
          f"-GW{data['gameweeks'][-1]} ({len(data['players'])} players), "
          f"generated at {data.get('generated_at')}")
    return data


def get_fpl_elements():
    """Reads player metadata (name, team, price) from the FPL API"""
    with urlopen(FPL_BOOTSTRAP) as url:
        data = json.loads(url.read().decode())
    teams = {t['id']: t['name'] for t in data['teams']}
    elements = {}
    for e in data['elements']:
        elements[e['id']] = {
            'Pos': POSITION_MAP.get(e['element_type'], ''),
            'Name': e['web_name'],
            'BV': e['now_cost'] / 10,
            'SV': e['now_cost'] / 10,
            'Team': teams.get(e['team'], ''),
            'element_type': e['element_type'],
            'team': e['team'],
        }
    return elements


def convert_to_dataframe(data, elements=None):
    """Converts an API response into the projection CSV layout"""

    if elements is None:
        elements = get_fpl_elements()

    gameweeks = data['gameweeks']
    rows = []
    missing = []

    for player in data['players']:
        pid = player['id']
        meta = elements.get(pid)
        if meta is None:
            # Player is in the projections but not (yet) in the FPL API
            missing.append(pid)
            meta = {
                'Pos': POSITION_NAME_MAP.get(player.get('position'), ''),
                'Name': str(pid),
                'BV': 0.0,
                'SV': 0.0,
                'Team': '',
                'element_type': 99,
                'team': 99,
            }

        row = {
            'Pos': meta['Pos'],
            'ID': pid,
            'Name': meta['Name'],
            'BV': meta['BV'],
            'SV': meta['SV'],
            'Team': meta['Team'],
            '_type': meta['element_type'],
            '_team': meta['team'],
        }

        by_gw = {p['gw']: p for p in player.get('projections', [])}
        for gw in gameweeks:
            p = by_gw.get(gw)
            row[f'{gw}_xMins'] = round(float(p['xmins']), 2) if p and p.get('xmins') is not None else 0.0
            row[f'{gw}_Pts'] = round(float(p['xp']), 2) if p and p.get('xp') is not None else 0.0
        rows.append(row)

    if missing:
        print(f"Warning: {len(missing)} players missing from the FPL API: {missing[:10]}")

    df = pd.DataFrame(rows)
    df.sort_values(by=['_type', '_team', 'ID'], inplace=True, ignore_index=True)
    df.drop(columns=['_type', '_team'], inplace=True)

    columns = ['Pos', 'ID', 'Name', 'BV', 'SV', 'Team']
    columns += [f'{gw}_xMins' for gw in gameweeks]
    columns += [f'{gw}_Pts' for gw in gameweeks]
    return df[columns]


def save_projections(gameweeks=DEFAULT_HORIZON, token=None, out_folder=None, season=None, url=None):
    """Fetches projections and writes them as static/projection/{season}/gw{N}.csv

    The file is named after the first gameweek in the response, which is the
    first gameweek whose deadline has not passed yet. Returns the file path.
    """

    data = fetch_projections(gameweeks=gameweeks, token=token, url=url)

    api_season = data.get('season')
    season = season or api_season or read_static()['season']
    if api_season and api_season != season:
        print(f"Warning: API season {api_season} differs from configured season {season}")

    start_gw = data['gameweeks'][0]

    if out_folder is None:
        out_folder = pathlib.Path(__file__).parent / 'static' / 'projection' / season
    out_folder = pathlib.Path(out_folder)
    out_folder.mkdir(parents=True, exist_ok=True)

    df = convert_to_dataframe(data)
    target = out_folder / f'gw{start_gw}.csv'
    df.to_csv(target, index=False)
    print(f"Wrote {len(df)} rows to {target}")
    return target


def convert_export(path, gameweeks=DEFAULT_HORIZON, out_folder=None):
    """Converts a raw Solio export into the projection CSV layout.

    The export carries one block of columns per gameweek
    (`{gw}_Pts`, `{gw}_xMins`, `{gw}_SD`, `{gw}_pPlay`, `{gw}_Fixtures`) and
    identifies players by `fpl_id`. Only the first `gameweeks` blocks are kept,
    and the file is named after the first gameweek it covers.
    """

    import re

    path = pathlib.Path(path)
    df = pd.read_csv(path)

    weeks = sorted(int(m.group(1)) for m in
                   (re.match(r'(\d+)_Pts$', c) for c in df.columns) if m)
    if not weeks:
        raise RuntimeError(f"No `{{gw}}_Pts` columns found in {path}")
    weeks = weeks[:gameweeks]
    print(f"Converting {path.name}: GW{weeks[0]}-GW{weeks[-1]} ({len(df)} players)")

    out = pd.DataFrame({
        'Pos': df['Pos'],
        'ID': df['fpl_id'] if 'fpl_id' in df.columns else df['ID'],
        'Name': df['Name'],
        'BV': df['Value'],
        'SV': df['Value'],
        'Team': df['Team'],
    })
    for gw in weeks:
        out[f'{gw}_xMins'] = df[f'{gw}_xMins'].round(2)
    for gw in weeks:
        out[f'{gw}_Pts'] = df[f'{gw}_Pts'].round(2)

    if out_folder is None:
        out_folder = path.parent
    out_folder = pathlib.Path(out_folder)
    out_folder.mkdir(parents=True, exist_ok=True)

    target = out_folder / f'gw{weeks[0]}.csv'
    out.to_csv(target, index=False)
    print(f"Wrote {len(out)} rows to {target}")
    return target


def find_projection_file(season, gw, base_folder='static/projection'):
    """Finds the projection file to use for a given gameweek.

    Prefers an exact match, then the most recent earlier file (its later
    columns still cover the requested gameweek), then the earliest later file.
    """
    import glob
    import re

    folder = pathlib.Path(base_folder) / str(season)
    available = {}
    for f in glob.glob(str(folder / 'gw*.csv')):
        m = re.search(r'gw(\d+)\.csv$', f.replace('\\', '/'))
        if m:
            available[int(m.group(1))] = f

    if not available:
        return None
    if gw in available:
        return available[gw]

    earlier = [g for g in available if g < gw]
    if earlier:
        return available[max(earlier)]
    later = [g for g in available if g > gw]
    if later:
        return available[min(later)]
    return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch Solio projections")
    parser.add_argument('--gameweeks', type=int, default=DEFAULT_HORIZON,
                        help=f"number of gameweeks to fetch (default {DEFAULT_HORIZON}, max 38)")
    parser.add_argument('--token', type=str, default=None,
                        help="API token (defaults to the SOLIO_TOKEN env variable)")
    parser.add_argument('--url', type=str, default=None,
                        help="API endpoint (defaults to the SOLIO_API_URL env variable)")
    parser.add_argument('--out', type=str, default=None,
                        help="output folder (defaults to static/projection/{season})")
    parser.add_argument('--season', type=str, default=None,
                        help="override the season folder name")
    parser.add_argument('--from-export', type=str, default=None,
                        help="convert a raw Solio export CSV instead of calling the API")
    args = parser.parse_args()

    try:
        if args.from_export:
            convert_export(args.from_export, gameweeks=args.gameweeks,
                           out_folder=args.out)
        else:
            save_projections(gameweeks=args.gameweeks, token=args.token,
                             out_folder=args.out, season=args.season, url=args.url)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
