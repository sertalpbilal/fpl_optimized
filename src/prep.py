#!/usr/bin/python3

# Data prep steps

import pandas as pd
import glob
import pathlib

from app import folder_order

def get_GW_folder(gw=None):

    if gw is None:
        all_dates = glob.glob(f'build/data/*/*/*/input/')
    else:
        all_dates = glob.glob(f'build/data/*/GW{gw}/*/input/')
    all_dates.sort(key=folder_order, reverse=True)
    return all_dates[0]


def get_multistage_data(gw=None, n=3):
    """ Returns the multi-period data available right before given GW """

    input_folder = pathlib.Path(get_GW_folder(gw))

    df = pd.read_csv(input_folder / 'element_gameweek.csv')
    next_week = df['event'].min()
    element_gameweek_df = df[df['event'] < next_week+n].copy()

    sum_md_df = element_gameweek_df.groupby(['player_id', 'web_name'])['points_md'].sum()
    sum_md_df.sort_values(inplace=True, ascending=False)
    sum_md_df = sum_md_df.reset_index().set_index('player_id').copy()

    df = pd.read_csv(input_folder / 'element.csv')
    element_df = df.copy().set_index('id')
    element_df['ict_sum'] = element_df['influence'] + element_df['creativity'] + element_df['threat']
    element_gameweek_df = pd.merge(left=element_gameweek_df, right=df, how='inner', left_on=['player_id'], right_on=['id'], suffixes=('', '_extra'))
    element_gameweek_df['rawxp'] = element_gameweek_df.apply(lambda r: r['points_md'] * 90 / max(1, r['xmins_md']), axis=1)
    elements = element_gameweek_df['player_id'].unique().tolist()
    gameweeks = element_gameweek_df['event'].unique().tolist()
    total_weeks = len(gameweeks)
    element_gameweek_df.set_index(['player_id', 'event'], inplace=True, drop=True)
    popular_element_df = element_df.sort_values(by=['selected_by_percent'], ascending=False)[['web_name', 'selected_by_percent']]

    team_codes = element_gameweek_df['team_code'].unique().tolist()
    
    types_df = pd.read_csv(input_folder / 'element_type.csv')
    types = types_df['id'].to_list()
    types_df.set_index('id', inplace=True, drop=True)

    position = [1,2,3,4]
    element_gameweek = [(e, g) for e in elements for g in gameweeks]

    return {
        'gw': gw,
        'input_folder': input_folder,
        'element_gameweek_df': element_gameweek_df,
        'sum_md_df': sum_md_df,
        'element_df': element_df,
        'total_weeks': total_weeks,
        'team_codes': team_codes,
        'types': types,
        'types_df': types_df,
        'position': position,
        'element_gameweek': element_gameweek,
        'elements': elements,
        'gameweeks': gameweeks
    }
