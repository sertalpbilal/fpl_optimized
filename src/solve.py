#!/usr/bin/python
# -*- coding: utf-8 -*-

import functools
import json
import os

import numpy as np
import pandas as pd
import sasoptpy as so


def solve_all(input_folder, output_folder):
    solve_no_limit_best_11(input_folder, output_folder)
    solve_limited_best_squad(input_folder, output_folder)
    solve_limited_squad_with_bench_weight(input_folder, output_folder)
    solve_bench_boost_squad(input_folder, output_folder)
    solve_best_differential_team(input_folder, output_folder)
    solve_best_set_and_forget(input_folder, output_folder)


def solve_no_limit_best_11(input_folder, output_folder):
    """Solves the no limit (money/team) best 11 (no full squad) problem"""
    df = pd.read_csv(input_folder / 'element_gameweek.csv')
    next_week = df['event'].min()
    next_week_df = df[df['event'] == next_week].copy()

    df = pd.read_csv(input_folder / 'element.csv')
    next_week_df = pd.merge(left=next_week_df, right=df, how='inner', left_on=['player_id'], right_on=['id'], suffixes=('', '_extra'))
    players = next_week_df['player_id'].unique().tolist()
    next_week_df.set_index('player_id', inplace=True, drop=True)
    
    types_df = pd.read_csv(input_folder / 'element_type.csv')
    types = types_df['id'].to_list()
    types_df.set_index('id', inplace=True, drop=True)

    m = so.Model(name='no_limit_best11', session=None)
    x = m.add_variables(players, name='lineup', vartype=so.BIN)
    y = m.add_variables(players, name='captain', vartype=so.BIN)

    m.add_constraint(so.quick_sum(x[i] for i in players) == 11, name='lineup_limit')
    m.add_constraints((
        so.quick_sum(x[i] for i in players if next_week_df.loc[i]['element_type'] == et) >= types_df.loc[et]['squad_min_play']
        for et in types), name='squad_min')
    m.add_constraints((
        so.quick_sum(x[i] for i in players if next_week_df.loc[i]['element_type'] == et) <= types_df.loc[et]['squad_max_play']
        for et in types), name='squad_max')
    m.add_constraint(so.quick_sum(y[i] for i in players) == 1, name='single_captain')
    m.add_constraints((y[i] <= x[i] for i in players), name='captain_should_play')

    m.set_objective(so.quick_sum(
        -next_week_df.loc[i]['points_md'] * (x[i]+y[i]) for i in players
    ), sense='N', name='maximize_points')

    mps_str = get_mps_string(m)

    with open(output_folder / "no_limit_best_11.mps", "w") as f:
        f.write(mps_str)
    
    filename = str(output_folder / "no_limit_best_11.mps")
    solutionname = str(output_folder / "no_limit_best_11.sol")
    csvname = str(output_folder / "no_limit_best_11.csv")
    
    solve_and_get_solution(filename, solutionname, m)
    
    # Parse solution
    selected_players = []
    for i in players:
        if x[i].get_value() > 0.5 and y[i].get_value() < 0.5:
            selected_players.append([i, 1, False])
        elif x[i].get_value() > 0.5 and y[i].get_value() > 0.5:
            selected_players.append([i, 2, True])
    results = pd.DataFrame(selected_players, columns=['player_id', 'multiplier', 'is_captain'])
    result_df = pd.merge(next_week_df, results, on='player_id', how='inner')
    result_df = result_df[['player_id', 'web_name', 'team_code', 'element_type', 'now_cost', 'event', 'points_md', 'is_captain', 'multiplier', 'selected_by_percent']].copy()
    result_df['gw_points'] = result_df['multiplier'] * result_df['points_md']
    result_df = result_df.sort_values(by=['element_type', 'player_id'], ignore_index=True)
    result_df.reset_index(drop=True, inplace=True)
    result_df.to_csv(csvname, encoding='utf-8')
    with pd.option_context('display.max_rows', None, 'display.max_columns', None, 'display.encoding', 'UTF-8'): 
        print(result_df)
    print(m.get_objective_value())


def solve_limited_best_squad(input_folder, output_folder):
    """Solves the budget (1000) and team limited best squad (lineup+subs) team"""
    df = pd.read_csv(input_folder / 'element_gameweek.csv')
    next_week = df['event'].min()
    next_week_df = df[df['event'] == next_week].copy()

    df = pd.read_csv(input_folder / 'element.csv')
    next_week_df = pd.merge(left=next_week_df, right=df, how='inner', left_on=['player_id'], right_on=['id'], suffixes=('', '_extra'))
    players = next_week_df['player_id'].unique().tolist()
    next_week_df.set_index('player_id', inplace=True, drop=True)

    team_codes = next_week_df['team_code'].unique().tolist()
    
    types_df = pd.read_csv(input_folder / 'element_type.csv')
    types = types_df['id'].to_list()
    types_df.set_index('id', inplace=True, drop=True)

    m = so.Model(name='limited_best_15', session=None)
    x = m.add_variables(players, name='lineup', vartype=so.BIN)
    y = m.add_variables(players, name='captain', vartype=so.BIN)
    z = m.add_variables(players, name='squad', vartype=so.BIN)

    m.add_constraint(so.quick_sum(x[i] for i in players) == 11, name='lineup_limit')
    m.add_constraints((
        so.quick_sum(x[i] for i in players if next_week_df.loc[i]['element_type'] == et) >= types_df.loc[et]['squad_min_play']
        for et in types), name='squad_min')
    m.add_constraints((
        so.quick_sum(x[i] for i in players if next_week_df.loc[i]['element_type'] == et) <= types_df.loc[et]['squad_max_play']
        for et in types), name='squad_max')
    m.add_constraint(so.quick_sum(y[i] for i in players) == 1, name='single_captain')
    m.add_constraints((y[i] <= x[i] for i in players), name='captain_should_play')

    # Limit constraints
    m.add_constraints((
        so.quick_sum(z[i] for i in players if next_week_df.loc[i]['element_type'] == et) == types_df.loc[et]['squad_select']
        for et in types), name='squad_exact')
    m.add_constraint(so.quick_sum(z[i] for i in players) == 15, name='squad_limit')
    m.add_constraints(
        (so.quick_sum(z[i] for i in players if next_week_df.loc[i]['team_code'] == j) <= 3 for j in team_codes),
        name='player_team_limit')
    m.add_constraint(
        so.quick_sum(z[i] * next_week_df.loc[i]['now_cost'] for i in players) <= 1000,
        name='total_cost_100')
    m.add_constraints(
        (x[i] <= z[i] for i in players), name='lineup_squad_con')

    m.set_objective(so.quick_sum(
        -next_week_df.loc[i]['points_md'] * (x[i]+y[i]) for i in players
    ), sense='N', name='maximize_points')

    mps_str = get_mps_string(m)

    with open(output_folder / "limited_best_15.mps", "w") as f:
        f.write(mps_str)
    
    filename = str(output_folder / "limited_best_15.mps")
    solutionname = str(output_folder / "limited_best_15.sol")
    csvname = str(output_folder / "limited_best_15.csv")
    
    solve_and_get_solution(filename, solutionname, m)
    
    # Parse solution
    selected_players = []
    for i in players:
        if z[i].get_value() > 0.5 and x[i].get_value() < 0.5:
            selected_players.append([i, 0, False, 0])
        elif x[i].get_value() > 0.5 and y[i].get_value() < 0.5:
            selected_players.append([i, 1, False, 1])
        elif x[i].get_value() > 0.5 and y[i].get_value() > 0.5:
            selected_players.append([i, 2, True, 1])
    results = pd.DataFrame(selected_players, columns=['player_id', 'multiplier', 'is_captain', 'starting_lineup'])
    result_df = pd.merge(next_week_df, results, on='player_id', how='inner')
    result_df = result_df[['player_id', 'web_name', 'team_code', 'element_type', 'now_cost', 'event', 'points_md', 'is_captain', 'multiplier', 'starting_lineup', 'selected_by_percent']].copy()
    result_df['gw_points'] = result_df['multiplier'] * result_df['points_md']
    result_df = result_df.sort_values(by=['starting_lineup', 'element_type', 'player_id'], ascending=[False, True, True], ignore_index=True)
    result_df.reset_index(drop=True, inplace=True)
    result_df.to_csv(csvname, encoding='utf-8')
    with pd.option_context('display.max_rows', None, 'display.max_columns', None, 'display.encoding', 'UTF-8'): 
        print(result_df)
    print(m.get_objective_value())


def solve_limited_squad_with_bench_weight(input_folder, output_folder):
    """Solves the budget (1000) and team limited best squad (lineup+subs) with weighted bench"""
    df = pd.read_csv(input_folder / 'element_gameweek.csv')
    next_week = df['event'].min()
    next_week_df = df[df['event'] == next_week].copy()

    df = pd.read_csv(input_folder / 'element.csv')
    next_week_df = pd.merge(left=next_week_df, right=df, how='inner', left_on=['player_id'], right_on=['id'], suffixes=('', '_extra'))
    players = next_week_df['player_id'].unique().tolist()
    next_week_df.set_index('player_id', inplace=True, drop=True)

    team_codes = next_week_df['team_code'].unique().tolist()
    
    types_df = pd.read_csv(input_folder / 'element_type.csv')
    types = types_df['id'].to_list()
    types_df.set_index('id', inplace=True, drop=True)

    m = so.Model(name='limited_best_15_weighted', session=None)
    x = m.add_variables(players, name='lineup', vartype=so.BIN)
    y = m.add_variables(players, name='captain', vartype=so.BIN)
    z = m.add_variables(players, name='squad', vartype=so.BIN)

    m.add_constraint(so.quick_sum(x[i] for i in players) == 11, name='lineup_limit')
    m.add_constraints((
        so.quick_sum(x[i] for i in players if next_week_df.loc[i]['element_type'] == et) >= types_df.loc[et]['squad_min_play']
        for et in types), name='squad_min')
    m.add_constraints((
        so.quick_sum(x[i] for i in players if next_week_df.loc[i]['element_type'] == et) <= types_df.loc[et]['squad_max_play']
        for et in types), name='squad_max')
    m.add_constraint(so.quick_sum(y[i] for i in players) == 1, name='single_captain')
    m.add_constraints((y[i] <= x[i] for i in players), name='captain_should_play')

    # Limit constraints
    m.add_constraints((
        so.quick_sum(z[i] for i in players if next_week_df.loc[i]['element_type'] == et) == types_df.loc[et]['squad_select']
        for et in types), name='squad_exact')
    m.add_constraint(so.quick_sum(z[i] for i in players) == 15, name='squad_limit')
    m.add_constraints(
        (so.quick_sum(z[i] for i in players if next_week_df.loc[i]['team_code'] == j) <= 3 for j in team_codes),
        name='player_team_limit')
    m.add_constraint(
        so.quick_sum(z[i] * next_week_df.loc[i]['now_cost'] for i in players) <= 1000,
        name='total_cost_100')
    m.add_constraints(
        (x[i] <= z[i] for i in players), name='lineup_squad_con')

    m.set_objective(so.quick_sum(
        -next_week_df.loc[i]['points_md'] * (x[i]+y[i]+0.1*(z[i]-x[i])) for i in players
    ), sense='N', name='maximize_points')

    mps_str = get_mps_string(m)

    with open(output_folder / "limited_best_15_weighted.mps", "w") as f:
        f.write(mps_str)
    
    filename = str(output_folder / "limited_best_15_weighted.mps")
    solutionname = str(output_folder / "limited_best_15_weighted.sol")
    csvname = str(output_folder / "limited_best_15_weighted.csv")
    
    solve_and_get_solution(filename, solutionname, m)
    
    # Parse solution
    selected_players = []
    for i in players:
        if z[i].get_value() > 0.5 and x[i].get_value() < 0.5:
            selected_players.append([i, 0, False, 0])
        elif x[i].get_value() > 0.5 and y[i].get_value() < 0.5:
            selected_players.append([i, 1, False, 1])
        elif x[i].get_value() > 0.5 and y[i].get_value() > 0.5:
            selected_players.append([i, 2, True, 1])
    results = pd.DataFrame(selected_players, columns=['player_id', 'multiplier', 'is_captain', 'starting_lineup'])
    result_df = pd.merge(next_week_df, results, on='player_id', how='inner')
    result_df = result_df[['player_id', 'web_name', 'team_code', 'element_type', 'now_cost', 'event', 'points_md', 'is_captain', 'multiplier', 'starting_lineup', 'selected_by_percent']].copy()
    result_df['gw_points'] = result_df['multiplier'] * result_df['points_md']
    result_df = result_df.sort_values(by=['starting_lineup', 'element_type', 'player_id'], ascending=[False, True, True], ignore_index=True)
    result_df.reset_index(drop=True, inplace=True)
    result_df.to_csv(csvname, encoding='utf-8')
    with pd.option_context('display.max_rows', None, 'display.max_columns', None, 'display.encoding', 'UTF-8'): 
        print(result_df)
    print(m.get_objective_value())

def solve_bench_boost_squad(input_folder, output_folder):
    """Solves the budget (1000) and team limited best bench boost squad"""
    df = pd.read_csv(input_folder / 'element_gameweek.csv')
    next_week = df['event'].min()
    next_week_df = df[df['event'] == next_week].copy()

    df = pd.read_csv(input_folder / 'element.csv')
    next_week_df = pd.merge(left=next_week_df, right=df, how='inner', left_on=['player_id'], right_on=['id'], suffixes=('', '_extra'))
    players = next_week_df['player_id'].unique().tolist()
    next_week_df.set_index('player_id', inplace=True, drop=True)

    team_codes = next_week_df['team_code'].unique().tolist()
    
    types_df = pd.read_csv(input_folder / 'element_type.csv')
    types = types_df['id'].to_list()
    types_df.set_index('id', inplace=True, drop=True)

    m = so.Model(name='limited_best_15_bb', session=None)
    x = m.add_variables(players, name='lineup', vartype=so.BIN)
    y = m.add_variables(players, name='captain', vartype=so.BIN)
    z = m.add_variables(players, name='squad', vartype=so.BIN)

    m.add_constraint(so.quick_sum(x[i] for i in players) == 11, name='lineup_limit')
    m.add_constraints((
        so.quick_sum(x[i] for i in players if next_week_df.loc[i]['element_type'] == et) >= types_df.loc[et]['squad_min_play']
        for et in types), name='squad_min')
    m.add_constraints((
        so.quick_sum(x[i] for i in players if next_week_df.loc[i]['element_type'] == et) <= types_df.loc[et]['squad_max_play']
        for et in types), name='squad_max')
    m.add_constraint(so.quick_sum(y[i] for i in players) == 1, name='single_captain')
    m.add_constraints((y[i] <= x[i] for i in players), name='captain_should_play')

    # Limit constraints
    m.add_constraints((
        so.quick_sum(z[i] for i in players if next_week_df.loc[i]['element_type'] == et) == types_df.loc[et]['squad_select']
        for et in types), name='squad_exact')
    m.add_constraint(so.quick_sum(z[i] for i in players) == 15, name='squad_limit')
    m.add_constraints(
        (so.quick_sum(z[i] for i in players if next_week_df.loc[i]['team_code'] == j) <= 3 for j in team_codes),
        name='player_team_limit')
    m.add_constraint(
        so.quick_sum(z[i] * next_week_df.loc[i]['now_cost'] for i in players) <= 1000,
        name='total_cost_100')
    m.add_constraints(
        (x[i] <= z[i] for i in players), name='lineup_squad_con')

    m.set_objective(so.quick_sum(
        -next_week_df.loc[i]['points_md'] * (z[i]+y[i]) for i in players
    ), sense='N', name='maximize_points')

    mps_str = get_mps_string(m)

    with open(output_folder / "limited_best_15_bb.mps", "w") as f:
        f.write(mps_str)
    
    filename = str(output_folder / "limited_best_15_bb.mps")
    solutionname = str(output_folder / "limited_best_15_bb.sol")
    csvname = str(output_folder / "limited_best_15_bb.csv")
    
    solve_and_get_solution(filename, solutionname, m)
    
    # Parse solution
    selected_players = []
    for i in players:
        if z[i].get_value() > 0.5 and x[i].get_value() < 0.5:
            selected_players.append([i, 0, False, 0])
        elif x[i].get_value() > 0.5 and y[i].get_value() < 0.5:
            selected_players.append([i, 1, False, 1])
        elif x[i].get_value() > 0.5 and y[i].get_value() > 0.5:
            selected_players.append([i, 2, True, 1])
    results = pd.DataFrame(selected_players, columns=['player_id', 'multiplier', 'is_captain', 'starting_lineup'])
    result_df = pd.merge(next_week_df, results, on='player_id', how='inner')
    result_df = result_df[['player_id', 'web_name', 'team_code', 'element_type', 'now_cost', 'event', 'points_md', 'is_captain', 'multiplier', 'starting_lineup', 'selected_by_percent']].copy()
    result_df['gw_points'] = result_df['multiplier'] * result_df['points_md']
    result_df = result_df.sort_values(by=['starting_lineup', 'element_type', 'player_id'], ascending=[False, True, True], ignore_index=True)
    result_df.reset_index(drop=True, inplace=True)
    result_df.to_csv(csvname, encoding='utf-8')
    with pd.option_context('display.max_rows', None, 'display.max_columns', None, 'display.encoding', 'UTF-8'): 
        print(result_df)
    print(m.get_objective_value())

def solve_best_differential_team(input_folder, output_folder):
    """Solves the budget (1000) and team limited best (weighted) squad under 5% ownership"""
    df = pd.read_csv(input_folder / 'element_gameweek.csv')
    next_week = df['event'].min()
    next_week_df = df[df['event'] == next_week].copy()

    df = pd.read_csv(input_folder / 'element.csv')
    next_week_df = pd.merge(left=next_week_df, right=df, how='inner', left_on=['player_id'], right_on=['id'], suffixes=('', '_extra'))
    players = next_week_df['player_id'].unique().tolist()
    next_week_df.set_index('player_id', inplace=True, drop=True)

    team_codes = next_week_df['team_code'].unique().tolist()
    
    types_df = pd.read_csv(input_folder / 'element_type.csv')
    types = types_df['id'].to_list()
    types_df.set_index('id', inplace=True, drop=True)

    m = so.Model(name='limited_best_15_weighted', session=None)
    x = m.add_variables(players, name='lineup', vartype=so.BIN)
    y = m.add_variables(players, name='captain', vartype=so.BIN)
    z = m.add_variables(players, name='squad', vartype=so.BIN)

    m.add_constraint(so.quick_sum(x[i] for i in players) == 11, name='lineup_limit')
    m.add_constraints((
        so.quick_sum(x[i] for i in players if next_week_df.loc[i]['element_type'] == et) >= types_df.loc[et]['squad_min_play']
        for et in types), name='squad_min')
    m.add_constraints((
        so.quick_sum(x[i] for i in players if next_week_df.loc[i]['element_type'] == et) <= types_df.loc[et]['squad_max_play']
        for et in types), name='squad_max')
    m.add_constraint(so.quick_sum(y[i] for i in players) == 1, name='single_captain')
    m.add_constraints((y[i] <= x[i] for i in players), name='captain_should_play')

    # Limit constraints
    m.add_constraints((
        so.quick_sum(z[i] for i in players if next_week_df.loc[i]['element_type'] == et) == types_df.loc[et]['squad_select']
        for et in types), name='squad_exact')
    m.add_constraint(so.quick_sum(z[i] for i in players) == 15, name='squad_limit')
    m.add_constraints(
        (so.quick_sum(z[i] for i in players if next_week_df.loc[i]['team_code'] == j) <= 3 for j in team_codes),
        name='player_team_limit')
    m.add_constraint(
        so.quick_sum(z[i] * next_week_df.loc[i]['now_cost'] for i in players) <= 1000,
        name='total_cost_100')
    m.add_constraints(
        (x[i] <= z[i] for i in players), name='lineup_squad_con')

    # Differential constraint
    m.add_constraints((z[i] == 0 for i in players if next_week_df.loc[i]['selected_by_percent'] > 5), name='allow_only_differentials')

    m.set_objective(so.quick_sum(
        -next_week_df.loc[i]['points_md'] * (x[i]+y[i]+0.1*(z[i]-x[i])) for i in players
    ), sense='N', name='maximize_points')

    mps_str = get_mps_string(m)

    with open(output_folder / "limited_best_differential.mps", "w") as f:
        f.write(mps_str)
    
    filename = str(output_folder / "limited_best_differential.mps")
    solutionname = str(output_folder / "limited_best_differential.sol")
    csvname = str(output_folder / "limited_best_differential.csv")
    
    solve_and_get_solution(filename, solutionname, m)
    
    # Parse solution
    selected_players = []
    for i in players:
        if z[i].get_value() > 0.5 and x[i].get_value() < 0.5:
            selected_players.append([i, 0, False, 0])
        elif x[i].get_value() > 0.5 and y[i].get_value() < 0.5:
            selected_players.append([i, 1, False, 1])
        elif x[i].get_value() > 0.5 and y[i].get_value() > 0.5:
            selected_players.append([i, 2, True, 1])
    results = pd.DataFrame(selected_players, columns=['player_id', 'multiplier', 'is_captain', 'starting_lineup'])
    result_df = pd.merge(next_week_df, results, on='player_id', how='inner')
    result_df = result_df[['player_id', 'web_name', 'team_code', 'element_type', 'now_cost', 'event', 'points_md', 'is_captain', 'multiplier', 'starting_lineup', 'selected_by_percent']].copy()
    result_df['gw_points'] = result_df['multiplier'] * result_df['points_md']
    result_df = result_df.sort_values(by=['starting_lineup', 'element_type', 'player_id'], ascending=[False, True, True], ignore_index=True)
    result_df.reset_index(drop=True, inplace=True)
    result_df.to_csv(csvname, encoding='utf-8')
    with pd.option_context('display.max_rows', None, 'display.max_columns', None, 'display.encoding', 'UTF-8'): 
        print(result_df)
    print(m.get_objective_value())


def solve_best_set_and_forget(input_folder, output_folder):
    """Solves the budget (1000) and team limited best squad (lineup+subs) with weighted bench total of 8 gameweeks"""
    df = pd.read_csv(input_folder / 'element_gameweek.csv')
    next_week = df['event'].min()
    # next_week_df = df[df['event'] == next_week].copy()
    next_week_df = df.groupby(['player_id', 'web_name', 'team'])['points_md'].sum()
    next_week_df = next_week_df.reset_index()

    df = pd.read_csv(input_folder / 'element.csv')
    next_week_df = pd.merge(left=next_week_df, right=df, how='inner', left_on=['player_id'], right_on=['id'], suffixes=('', '_extra'))
    players = next_week_df['player_id'].unique().tolist()
    next_week_df.set_index('player_id', inplace=True, drop=True)

    team_codes = next_week_df['team_code'].unique().tolist()
    
    types_df = pd.read_csv(input_folder / 'element_type.csv')
    types = types_df['id'].to_list()
    types_df.set_index('id', inplace=True, drop=True)

    m = so.Model(name='limited_best_15_weighted', session=None)
    x = m.add_variables(players, name='lineup', vartype=so.BIN)
    y = m.add_variables(players, name='captain', vartype=so.BIN)
    z = m.add_variables(players, name='squad', vartype=so.BIN)

    m.add_constraint(so.quick_sum(x[i] for i in players) == 11, name='lineup_limit')
    m.add_constraints((
        so.quick_sum(x[i] for i in players if next_week_df.loc[i]['element_type'] == et) >= types_df.loc[et]['squad_min_play']
        for et in types), name='squad_min')
    m.add_constraints((
        so.quick_sum(x[i] for i in players if next_week_df.loc[i]['element_type'] == et) <= types_df.loc[et]['squad_max_play']
        for et in types), name='squad_max')
    m.add_constraint(so.quick_sum(y[i] for i in players) == 1, name='single_captain')
    m.add_constraints((y[i] <= x[i] for i in players), name='captain_should_play')

    # Limit constraints
    m.add_constraints((
        so.quick_sum(z[i] for i in players if next_week_df.loc[i]['element_type'] == et) == types_df.loc[et]['squad_select']
        for et in types), name='squad_exact')
    m.add_constraint(so.quick_sum(z[i] for i in players) == 15, name='squad_limit')
    m.add_constraints(
        (so.quick_sum(z[i] for i in players if next_week_df.loc[i]['team_code'] == j) <= 3 for j in team_codes),
        name='player_team_limit')
    m.add_constraint(
        so.quick_sum(z[i] * next_week_df.loc[i]['now_cost'] for i in players) <= 1000,
        name='total_cost_100')
    m.add_constraints(
        (x[i] <= z[i] for i in players), name='lineup_squad_con')

    m.set_objective(so.quick_sum(
        -next_week_df.loc[i]['points_md'] * (x[i]+y[i]+0.1*(z[i]-x[i])) for i in players
    ), sense='N', name='maximize_points')

    mps_str = get_mps_string(m)

    with open(output_folder / "limited_best_set_and_forget.mps", "w") as f:
        f.write(mps_str)
    
    filename = str(output_folder / "limited_best_set_and_forget.mps")
    solutionname = str(output_folder / "limited_best_set_and_forget.sol")
    csvname = str(output_folder / "limited_best_set_and_forget.csv")
    
    solve_and_get_solution(filename, solutionname, m)
    
    # Parse solution
    selected_players = []
    for i in players:
        if z[i].get_value() > 0.5 and x[i].get_value() < 0.5:
            selected_players.append([i, 0, False, 0])
        elif x[i].get_value() > 0.5 and y[i].get_value() < 0.5:
            selected_players.append([i, 1, False, 1])
        elif x[i].get_value() > 0.5 and y[i].get_value() > 0.5:
            selected_players.append([i, 2, True, 1])
    results = pd.DataFrame(selected_players, columns=['player_id', 'multiplier', 'is_captain', 'starting_lineup'])
    result_df = pd.merge(next_week_df, results, on='player_id', how='inner')
    result_df = result_df[['player_id', 'web_name', 'team_code', 'element_type', 'now_cost', 'points_md', 'is_captain', 'multiplier', 'starting_lineup', 'selected_by_percent']].copy()
    result_df['points_md'] = result_df['points_md'] / 8
    result_df['gw_points'] = result_df['multiplier'] * result_df['points_md']
    result_df = result_df.sort_values(by=['starting_lineup', 'element_type', 'player_id'], ascending=[False, True, True], ignore_index=True)
    result_df.reset_index(drop=True, inplace=True)
    result_df.to_csv(csvname, encoding='utf-8')
    with pd.option_context('display.max_rows', None, 'display.max_columns', None, 'display.encoding', 'UTF-8'): 
        print(result_df)
    print(m.get_objective_value())



def get_mps_string(model):
    mps = model.to_mps()
    # Convert to standard MPS format
    mps._set_value(0, 'Field2', mps.loc[0, 'Field3'])
    mps._set_value(0, 'Field3', '')
    mps._set_value(0, 'Field4', np.nan)
    mps._set_value(0, 'Field6', np.nan)
    mps._set_value(len(mps)-1, 'Field4', np.nan)
    mps._set_value(len(mps)-1, 'Field6', np.nan)
    mps.drop(columns="_id_", inplace=True)
    def add_space(r):
        keywords = ['NAME', 'ROWS', 'COLUMNS', 'RHS', 'BOUNDS', 'RANGES', 'ENDATA']
        if r not in keywords:
            return " " + r
        else:
            return r
    mps['Field1'] = mps['Field1'].apply(add_space)

    formatters={
        'Field1': '{{:<{}s}}'.format(mps['Field1'].str.len().max()).format,
        'Field2': '{{:<{}s}}'.format(mps['Field2'].str.len().max()).format,
        'Field3': '{{:<{}s}}'.format(mps['Field3'].str.len().max()).format,
        'Field5': '{{:<{}s}}'.format(mps['Field5'].str.len().max()).format,
        }

    mps_str = mps.to_string(formatters=formatters, index=False, header=False, na_rep='')
    mps_str = '\n'.join([i[1:] for i in mps_str.split('\n')])

    return mps_str


def solve_and_get_solution(mps_file, solution_file, model):
    r = os.system(f'cbc {mps_file} solve solu {solution_file}')
    if r == 0:
        with open(solution_file, 'r') as f:
            for line in f:
                if line[0] != " ":
                    continue
                solution_line = line.split()
                variable_name = solution_line[1]
                variable_value = solution_line[2]
                e = model.get_variable(variable_name)
                e.set_value(float(variable_value))
