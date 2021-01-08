#!/usr/bin/python3

# A set of working problems

# import functools
# import json
# import os

# import numpy as np
import pandas as pd
import sasoptpy as so
# import random
from solve import solve_and_get_solution, get_mps_string
from prep import get_multistage_data
import pathlib

def generate_pareto_front_for_gain_loss(gw):
    results = []
    n = 20
    markers = [i*(1/n) for i in range(n+1)]
    pairs = [(i, 1-i) for i in markers]
    for [gain_weight, loss_weight] in pairs:
        result = solve_gain_loss_problem_1GW(gw=gw, weights={'gain': gain_weight, 'loss': loss_weight})
        values = {'gain_weight': gain_weight, 'loss_weight': loss_weight}
        values.update(result)
        results.append(values)

    results_df = pd.DataFrame(results)
    print(results_df)

    base_folder = pathlib.Path().resolve()
    output_folder = pathlib.Path(base_folder / f"build/work/")
    output_folder.mkdir(parents=True, exist_ok=True)
    results_df.to_excel(output_folder / f"pareto-front-{gw}.xlsx")

def solve_gain_loss_problem_1GW(gw, weights, options=None):

    if options is None:
        options = dict()

    data = get_multistage_data(gw, n=1)
    base_folder = pathlib.Path().resolve()
    output_folder = pathlib.Path(base_folder / f"build/work/")
    output_folder.mkdir(parents=True, exist_ok=True)
    
    gw = data['gw']
    players = data['elements']
    types = data['types']
    types_df = data['types_df']
    next_week_df = data['element_gameweek_df']
    team_codes = data['team_codes']
    element_df = data['element_df']
    
    m = so.Model(name='gainloss', session=None)
    x = m.add_variables(players, name='lineup', vartype=so.BIN)
    y = m.add_variables(players, name='captain', vartype=so.BIN)
    z = m.add_variables(players, name='squad', vartype=so.BIN)

    m.add_constraint(so.quick_sum(x[i] for i in players) == 11, name='lineup_limit')
    m.add_constraints((
        so.quick_sum(x[i] for i in players if next_week_df.loc[i, gw]['element_type'] == et) >= types_df.loc[et]['squad_min_play']
        for et in types), name='squad_min')
    m.add_constraints((
        so.quick_sum(x[i] for i in players if next_week_df.loc[i, gw]['element_type'] == et) <= types_df.loc[et]['squad_max_play']
        for et in types), name='squad_max')
    m.add_constraint(so.quick_sum(y[i] for i in players) == 1, name='single_captain')
    m.add_constraints((y[i] <= x[i] for i in players), name='captain_should_play')

    # Limit constraints
    m.add_constraints((
        so.quick_sum(z[i] for i in players if next_week_df.loc[i, gw]['element_type'] == et) == types_df.loc[et]['squad_select']
        for et in types), name='squad_exact')
    m.add_constraint(so.quick_sum(z[i] for i in players) == 15, name='squad_limit')
    m.add_constraints(
        (so.quick_sum(z[i] for i in players if next_week_df.loc[i, gw]['team_code'] == j) <= 3 for j in team_codes),
        name='player_team_limit')
    m.add_constraint(
        so.quick_sum(z[i] * next_week_df.loc[i, gw]['now_cost'] for i in players) <= 1000,
        name='total_cost_100')
    m.add_constraints(
        (x[i] <= z[i] for i in players), name='lineup_squad_con')

    gain_weight = weights['gain']
    loss_weight = weights['loss']

    total_gain = so.quick_sum(next_week_df.loc[e, gw]['points_md']*(1-element_df.loc[e]['selected_by_percent']/100.0)*x[e] for e in players)
    total_loss = so.quick_sum(next_week_df.loc[e, gw]['points_md']*(element_df.loc[e]['selected_by_percent']/100.0)*(1-x[e]) for e in players)
    weighted_net = gain_weight * total_gain - loss_weight * total_loss
    overall_net = total_gain - total_loss

    if options.get('overall_net_lb') is not None:
        m.add_constraint(overall_net >= options['overall_net_lb'], name='overall_net_lb_con')

    m.set_objective(
        # so.quick_sum(-next_week_df.loc[i, gw]['points_md'] * (x[i]+y[i]) for i in players)
        - weighted_net, sense='N', name='maximize_points')

    mps_str = get_mps_string(m)

    problem_name = f"GW{gw}_gain_loss_{gain_weight:.3f}_{loss_weight:.3f}"

    if options.get('name') is not None:
        problem_name += '_' + options['name']

    with open(output_folder / f"{problem_name}.mps", "w") as f:
        f.write(mps_str)
    
    filename = str(output_folder / f"{problem_name}.mps")
    solutionname = str(output_folder / f"{problem_name}.sol")
    csvname = str(output_folder / f"{problem_name}.csv")
    
    solve_and_get_solution(filename, solutionname, m)

    selected_players = []
    for i in players:
        if z[i].get_value() > 0.5 and x[i].get_value() < 0.5:
            selected_players.append([i, gw, 0, False, 0])
        elif x[i].get_value() > 0.5 and y[i].get_value() < 0.5:
            selected_players.append([i, gw, 1, False, 1])
        elif x[i].get_value() > 0.5 and y[i].get_value() > 0.5:
            selected_players.append([i, gw, 2, True, 1])
    results = pd.DataFrame(selected_players, columns=['player_id', 'event', 'multiplier', 'is_captain', 'starting_lineup'])
    result_df = pd.merge(next_week_df, results, on=['player_id', 'event'], how='inner')
    result_df = result_df[['player_id', 'web_name', 'team_code', 'element_type', 'now_cost', 'event', 'points_md', 'is_captain', 'multiplier', 'starting_lineup', 'selected_by_percent']].copy()
    result_df['gw_points'] = result_df['multiplier'] * result_df['points_md']
    result_df = result_df.sort_values(by=['starting_lineup', 'element_type', 'player_id'], ascending=[False, True, True], ignore_index=True)
    result_df.reset_index(drop=True, inplace=True)
    result_df.to_csv(csvname, encoding='utf-8')
    lineup_players = result_df['web_name'].tolist()[0:11]
    with pd.option_context('display.max_rows', None, 'display.max_columns', None, 'display.encoding', 'UTF-8'): 
        print(result_df)
    print(weights, )
    print(m.get_objective_value())
    
    return {"gain": total_gain.get_value(), "loss": total_loss.get_value(), "obj": weighted_net.get_value(), "net": overall_net.get_value(), "lineup": ', '.join(lineup_players)}


if __name__ == "__main__":
    generate_pareto_front_for_gain_loss(16)
    generate_pareto_front_for_gain_loss(17)