#!/usr/bin/python
# -*- coding: utf-8 -*-

import functools
import json
import os

import numpy as np
import pandas as pd
import sasoptpy as so
import random


def solve_all(input_folder, output_folder):
    solve_no_limit_best_11(input_folder, output_folder)
    solve_limited_best_squad(input_folder, output_folder)
    solve_limited_squad_with_bench_weight(input_folder, output_folder)
    solve_bench_boost_squad(input_folder, output_folder)
    solve_best_differential_team(input_folder, output_folder)
    solve_best_set_and_forget(input_folder, output_folder)
    # solve_iterative_squads(input_folder, output_folder, 10)


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


def solve_iterative_squads(input_folder, output_folder, total_iter=50):
    """Solves for best squads iteratively for generating an interactive list"""
    df = pd.read_csv(input_folder / 'element_gameweek.csv')
    next_week = df['event'].min()
    element_gameweek_df = df[df['event'] < next_week+3].copy()

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

    m = so.Model(name='iterative_model', session=None)
    lineup = m.add_variables(elements, gameweeks, name='lineup', vartype=so.BIN)
    captain = m.add_variables(elements, gameweeks, name='captain', vartype=so.BIN)
    squad = m.add_variables(elements, name='squad', vartype=so.BIN)
    bench = m.add_variables(elements, gameweeks, position, name='bench', vartype=so.BIN)

    m.add_constraints(
        (so.quick_sum(lineup[e, g] for e in elements) == 11 for g in gameweeks),
        name='lineup_limit_per_week')

    m.add_constraints((
        so.quick_sum(lineup[e, g] for e in elements if element_df.loc[e]['element_type'] == et) >= types_df.loc[et]['squad_min_play']
        for et in types for g in gameweeks), name='squad_min')

    m.add_constraints((
        so.quick_sum(lineup[e, g] for e in elements if element_df.loc[e]['element_type'] == et) <= types_df.loc[et]['squad_max_play']
        for et in types for g in gameweeks), name='squad_max')

    m.add_constraints((so.quick_sum(captain[e, g] for e in elements) == 1 for g in gameweeks), name='single_captain')
    m.add_constraints((captain[e, g] <= lineup[e, g] for e in elements for g in gameweeks), name='captain_should_play')

    # Limit constraints
    m.add_constraints((
        so.quick_sum(squad[e] for e in elements if element_df.loc[e]['element_type'] == et) == types_df.loc[et]['squad_select']
        for et in types), name='squad_exact')
    m.add_constraint(so.quick_sum(squad[e] for e in elements) == 15, name='squad_limit')
    m.add_constraints(
        (so.quick_sum(squad[e] for e in elements if element_df.loc[e]['team_code'] == j) <= 3 for j in team_codes),
        name='player_team_limit')
    # m.add_constraint(
    #     so.quick_sum(squad[i] * next_week_df.loc[i]['now_cost'] for i in players) <= 1000,
    #     name='total_cost_100')
    m.add_constraints(
        (lineup[e, g] <= squad[e] for e in elements for g in gameweeks), name='lineup_squad_con')
    m.add_constraints(
        (bench[e, g, p] <= squad[e] for e in elements for g in gameweeks for p in position), name='bench_squad_con')
    m.add_constraints(
        (so.quick_sum(bench[e, g, p] for e in elements) == 1 for g in gameweeks for p in position), name='bench_position_con')
    m.add_constraints(
        (so.quick_sum(bench[e, g, 1] for e in elements if element_df.loc[e]['element_type'] == 1) == 1 for g in gameweeks), name='only_gk_bench1')
    m.add_constraints(
        (lineup[e, g] + so.quick_sum(bench[e, g, p] for p in position) == squad[e] for e in elements for g in gameweeks), name='lineup_plus_bench_equal_squad')

    # Budget Constraint
    budget_con = m.add_constraint(so.quick_sum(squad[e] * element_df.loc[e]['now_cost'] for e in elements) <= 1000, name='budget_con')

    # Every player should play at least once
    m.add_constraints((so.quick_sum(lineup[e,g] for g in gameweeks) >= squad[e] for e in elements), name='play_at_least_once')

    total_points = so.quick_sum(element_gameweek_df.loc[e, g]['points_md'] * (lineup[e, g]+ captain[e,g] + so.quick_sum(bench[e,g,p]*10**min(-p+1, -1) for p in position)) for e in elements for g in gameweeks) / total_weeks / element_gameweek_df['points_md'].max()
    cost_points = so.quick_sum(element_df.loc[e]['now_cost'] * squad[e] for e in elements) / element_df['now_cost'].max()
    xmin_points = so.quick_sum(element_gameweek_df.loc[e, g]['xmins_md']*lineup[e,g] for e in elements for g in gameweeks) / total_weeks / element_gameweek_df['xmins_md'].max()
    ep_points = so.quick_sum(element_df.loc[e]['ep_this'] * lineup[e, next_week] for e in elements) / element_df['ep_this'].max()
    form_points = so.quick_sum(element_df.loc[e]['form'] * lineup[e, next_week] for e in elements) / element_df['form'].max()
    ppg_points = so.quick_sum(element_df.loc[e]['points_per_game'] * lineup[e, next_week] for e in elements) / element_df['points_per_game'].max()
    bps_points = so.quick_sum(element_df.loc[e]['bps'] * lineup[e, next_week] for e in elements) / element_df['bps'].max()
    ict_points = so.quick_sum(element_df.loc[e]['ict_sum'] * lineup[e, next_week] for e in elements) / element_df['ict_sum'].max()
    rawxP_points = so.quick_sum(element_gameweek_df.loc[e, g]['rawxp'] * lineup[e, g] for e in elements for g in gameweeks) / total_weeks / element_gameweek_df['rawxp'].max()
    ownership_points = so.quick_sum(element_gameweek_df.loc[e, g]['points_md']*(1-lineup[e, g])*element_df.loc[e]['selected_by_percent']/100.0 for e in elements for g in gameweeks) / total_weeks / element_gameweek_df['points_md'].max()

    m.set_objective(-total_points,
        sense='N', name='maximize_points')

    name = "iterative_model"

    filename = str(output_folder / f"{name}.mps")
    solutionname = str(output_folder / f"{name}.sol")
    csvname = str(output_folder / f"{name}.csv")
    
    all_solutions = []
    w1 = 1
    w2 = w3 = w4 = w5 = w6 = w7 = w8 = w9 = w10 = 0

    random.seed(42)

    for iteration in range(total_iter):

        if iteration > 0:
            # add squad cut
            m.add_constraint(so.quick_sum(squad[e] for e in elements if squad[e].get_value() > 0.5) <= 12, name=f"cutoff_{iteration}")

            # change objective
            w1, w2, w3, w4, w5, w6, w7, w8, w9 = (random.random() for _ in range(9))
            w10 = random.random()*2-1
            # m.set_objective(- (
            #     w1 * total_points + w2 * cost_points + w3 * xmin_points + w4 * ep_points + w5 * form_points + w6 * ppg_points + w7 * bps_points + w8 * ict_points + w9 * rawxP_points + w10 * ownership_points),
            #     sense='N', name=f'obj_{iteration}')

            # # Idea 1: Discard most popular/owned 1 out of 3 players
            # selected_ids = [e for e in elements if squad[e].get_value() > 0.5]
            # selected_els_df = popular_element_df[popular_element_df.index.isin(selected_ids)]
            # top3_els = selected_els_df.index[:3].to_list()
            # print('Popular cut', selected_els_df.loc[top3_els]['web_name'])
            # m.add_constraint(so.quick_sum(squad[e] for e in top3_els) <= 2, name=f'popular_cut_{iteration}')

            # # Idea 2: Discard player with most return 1 out of 3 players
            # selected_els_df = sum_md_df[sum_md_df.index.isin(selected_ids)]
            # top3_els = selected_els_df.index[:3].to_list()
            # print('Return cut', selected_els_df.loc[top3_els]['web_name'])
            # m.add_constraint(so.quick_sum(squad[e] for e in top3_els) <= 2, name=f'return_cut_{iteration}')

            # # Idea 3: Discard 3 players each time


            # # add position cuts
            # # m.add_constraints((so.quick_sum(squad[e] for e in elements if squad[e].get_value() > 0.5 and element_df.loc[e]['element_type'] == et) <= types_df.loc[et]['squad_select']-1 for et in types), name=f"el_type_cutoff_{iteration}")
            # # add squad cut
            # # m.add_constraint(so.quick_sum(squad[e] for e in elements if squad[e].get_value() > 0.5) <= 14, name=f"cutoff_{iteration}")
            # # budget_adj = iteration // 5
            # # budget_con.set_rhs(1050 - budget_adj*10)
            # # m.set_objective(total_points - ownership_weight*missed_ownership_points - budget_weight*cost_value_points, sense='N', name=f'obj_b{budget_weight}_o{ownership_weight}')
            # # m.set_objective(total_points - ownership_weight*missed_ownership_points, sense='N', name=f'obj_o{ownership_weight}')


        mps_str = get_mps_string(m)
        with open(output_folder / f"{name}.mps", "w") as f:
            f.write(mps_str)
        
        for v in m.get_variables():
            v.set_value(0)

        solve_and_get_solution(filename, solutionname, m)
        
        print(f"DONE {iteration}")

        # Parse solution
        solution = {"id": iteration, "squad":[], "lineup": {g:[] for g in gameweeks}, "bench": {g:{} for g in gameweeks}, "captain": {g: 0 for g in gameweeks}, "ownership": {}}
        for e in elements:
            if squad[e].get_value() > 0.5:
                solution['squad'].append(e)
        for e in elements:
            for g in gameweeks:
                if lineup[e, g].get_value() > 0.5:
                    solution['lineup'][g].append(e)
                elif squad[e].get_value() > 0.5:
                    for p in position:
                        if bench[e, g, p].get_value() > 0.5:
                            solution['bench'][g][p] = e
                if captain[e, g].get_value() > 0.5:
                    solution['captain'][g] = e
        # solution["params"] = {'ownership_weight': ownership_weight} # 'cost_weight': budget_weight,
        solution["params"] = {'pts_weight': w1, 'cost_weight': w2, 'xmin_weight': w3, 'ep_weight': w4, 'form_weight': w5, 'ppg_weight': w6, 'bps_weight': w7, 'ict_weight': w8, 'rawxp_weight': w9, 'ownership_weight': w10}
        solution["players"] = [element_df.loc[e]['web_name'] for e in solution['squad']]
        solution["xP"] = {g: [element_gameweek_df.loc[e, g]['points_md'] for e in solution['squad']] for g in gameweeks}
        solution["obj"] = {"overall": m.get_objective_value(),
        "total_points": total_points.get_value(), "cost_points": cost_points.get_value(),
        "xmin_points": xmin_points.get_value(), "ep_points": ep_points.get_value(),
        "form_points": form_points.get_value(), "ppg_points": ppg_points.get_value(),
        "bps_points": bps_points.get_value(), "ict_points": ict_points.get_value(),
        "rawxP_points": rawxP_points.get_value(), "ownership_points": ownership_points.get_value()} #, "missed_ownership_points": missed_ownership_points.get_value()} #, "budget_points": cost_value_points.get_value()}
        solution["cost"] = [float(element_df.loc[e]['now_cost']) for e in solution['squad']]
        solution["total_cost"] = sum(solution["cost"])
        solution["ownership"]["squad"] = [float(element_df.loc[e]["selected_by_percent"]) for e in solution['squad']]
        solution["ownership"]["sum"] = sum(solution["ownership"]["squad"])
        solution["element_type"] = [int(element_df.loc[e]['element_type']) for e in solution['squad']]
        solution["team_code"] = [int(element_df.loc[e]['team_code']) for e in solution['squad']]
        solution["weeks"] = gameweeks
        for g in gameweeks:
            solution["obj"][g] = so.quick_sum(-element_gameweek_df.loc[e, g]['points_md'] * (lineup[e, g]+ captain[e,g] + so.quick_sum(bench[e,g,p]*10**min(-p+1, -1) for p in position)) for e in elements).get_value()

        print(solution)
        print(m.get_objective_value())
        all_solutions.append(solution)

        with open(output_folder / "iterative_model.json", "w") as f:
            json.dump(all_solutions, f)
    
    print(all_solutions)



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
    if mps_str[0] == " ":
        mps_str = '\n'.join([i[1:] for i in mps_str.split('\n')])

    return mps_str


def solve_and_get_solution(mps_file, solution_file, model):

    if os.path.exists(solution_file):
        print("File exists!")
        r = os.system(f'cbc {mps_file} mips {solution_file} solve solu {solution_file}')
    else:
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
