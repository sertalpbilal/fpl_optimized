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


def solve_maximin_problem(gw, options=None):

    if options is None:
        options = dict()

    data = get_multistage_data(gw, n=1)
    base_folder = pathlib.Path().resolve()
    output_folder = pathlib.Path(base_folder / f"build/work/")
    output_folder.mkdir(parents=True, exist_ok=True)
    options['output_folder'] = output_folder
    
    gw = data['gw']
    players = data['elements']
    types = data['types']
    types_df = data['types_df']
    next_week_df = data['element_gameweek_df']
    team_codes = data['team_codes']
    element_df = data['element_df']
    element_df['value'] = [next_week_df.loc[i, gw]['points_md'] / element_df.loc[i]['now_cost'] * 10 for i in element_df.index]
    sorted_elements = element_df.sort_values(by=['element_type', 'id'], ascending=[True, True], ignore_index=False)

    max_xp = next_week_df['points_md'].max()
    
    m = so.Model(name='o_ring_max_min_problem', session=None)
    x = m.add_variables(players, name='lineup', vartype=so.BIN)
    z = m.add_variables(players, name='squad', vartype=so.BIN)

    m.add_constraint(so.quick_sum(x[i] for i in players) == 11, name='lineup_limit')
    m.add_constraints((
        so.quick_sum(x[i] for i in players if next_week_df.loc[i, gw]['element_type'] == et) >= types_df.loc[et]['squad_min_play']
        for et in types), name='squad_min')
    m.add_constraints((
        so.quick_sum(x[i] for i in players if next_week_df.loc[i, gw]['element_type'] == et) <= types_df.loc[et]['squad_max_play']
        for et in types), name='squad_max')

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

    total_lineup_xp = so.quick_sum(next_week_df.loc[i, gw]['points_md'] * x[i] for i in players)
    # total_squad_xp = so.quick_sum(next_week_df.loc[i, gw]['points_md'] * z[i] for i in players)    
    total_eff_value = so.quick_sum(element_df.loc[i]['value'] * x[i] for i in players)
    total_ownership = so.quick_sum(element_df.loc[i]['selected_by_percent'] * x[i] for i in players)
    total_xp_per_type = [so.quick_sum(next_week_df.loc[i, gw]['points_md'] * x[i] for i in players if element_df.loc[i]['element_type'] == k) for k in types]

    min_lineup_xp = lambda: min(next_week_df.loc[i, gw]['points_md'] for i in players if x[i].get_value() > 0.5)
    min_eff_value = lambda: min(element_df.loc[i]['value'] for i in players if x[i].get_value() > 0.5)
    min_ownership = lambda: min(element_df.loc[i]['selected_by_percent'] for i in players if x[i].get_value() > 0.5)
    min_xp_per_type = lambda: [round(min(next_week_df.loc[i, gw]['points_md'] for i in players if element_df.loc[i]['element_type'] == k and x[i].get_value() > 0.5),2) for k in types]
    get_lineup = lambda: ', '.join([sorted_elements.loc[e].web_name for e in sorted_elements.index if x[e].get_value() > 0.5])

    get_sol_summary = lambda: {
        'problem_name': problem_name,
        'total_lineup_xp': round(total_lineup_xp.get_value(), 3),
        'total_eff_value': round(total_eff_value.get_value(), 3),
        'total_ownership': round(total_ownership.get_value(), 1),
        'total_xp_per_type': [round(i.get_value(),3) for i in total_xp_per_type],
        'min_linuep_xp': round(min_lineup_xp(), 3),
        'min_eff_value': round(min_eff_value(), 3),
        'min_ownership': round(min_ownership(), 1),
        'min_xp_per_type': min_xp_per_type(),
        'lineup': get_lineup()}

    comp_values = []

    # Stage 0 - Lineup maximization

    m.set_objective(-total_lineup_xp, sense='N', name='regular_obj')
    problem_name = f"GW{gw}_maximin_0_base"
    solve_and_save_to_file(m, problem_name, data, options)
    comp_values.append(get_sol_summary())
    print(comp_values)

    # Problem 1 - Stage 1 - Max-min

    for i in players:
        x[i].set_value(0)
        z[i].set_value(0)

    m1 = so.Model(name='maximin')
    m1.include(m)
    w = m1.add_variable(name='weakest_link',vartype=so.CONT)
    m1.add_constraints(
        (w <= x[i] * next_week_df.loc[i, gw].points_md + (1-x[i]) * max_xp for i in players), name='weakest_link_con')
    m1.set_objective(-w, sense='N', name='max_min_obj')
    problem_name = f"GW{gw}_maximin_1_1_maximin"
    solve_and_save_to_file(m1, problem_name, data, options)
    comp_values.append(get_sol_summary())
    print(comp_values)

    # Problem 1 - Stage 2 - Max Lineup xP

    for i in players:
        x[i].set_value(0)
        z[i].set_value(0)

    m1.add_constraint(w >= w.get_value(), name='w_lb')
    m1.set_objective(-total_lineup_xp, sense='N', name='max_lineup')

    problem_name = f"GW{gw}_maximin_1_2_maximin"
    solve_and_save_to_file(m1, problem_name, data, options)
    comp_values.append(get_sol_summary())
    print(comp_values)

    # # Problem 1 - Stage 3 - Max Squad xP

    # m.add_constraints((x[i] >= round(x[i].get_value()) for i in players), name='fix_lineup')

    # for i in players:
    #     x[i].set_value(0)
    #     z[i].set_value(0)

    # m.set_objective(-total_squad_xp, sense='N', name='max_squad')
    # problem_name = f"GW{gw}_maximin_1_3_maximin"
    # solve_and_save_to_file(m, problem_name, data, options)

    # Problem 2 - Maximin per position

    for i in players:
        x[i].set_value(0)
        z[i].set_value(0)

    m2 = so.Model(name='maximin_per_position')
    m2.include(m)
    w = m2.add_variable('w', vartype=so.CONT)

    # w_type = m2.add_variables(types, name='weakest_link_pos')
    # m2.add_constraints(
    #     (w_type[k] <= x[i] * next_week_df.loc[i, gw].points_md + (1-x[i]) * max_xp for i in players for k in types if element_df.loc[i]['element_type'] == k), name='weakest_link_type_con')
    # m2.set_objective(-so.quick_sum(w_type[k] for k in types), sense='N', name='type_max')

    m2.add_constraints(
        (w <= so.quick_sum(x[i] * next_week_df.loc[i, gw].points_md for i in players if element_df.loc[i]['element_type'] == k) for k in types if k != 1), name='weakest_link_type_con')
    m2.set_objective(-w, sense='N', name='type_max')
    problem_name = f"GW{gw}_maximin_2_1_pos"
    solve_and_save_to_file(m2, problem_name, data, options)
    comp_values.append(get_sol_summary())
    print(comp_values)

    # Problem 2 - Stage 2

    for i in players:
        x[i].set_value(0)
        z[i].set_value(0)
    
    m2.add_constraint(w >= w.get_value(), name='w_lb')
    m2.set_objective(-total_lineup_xp, sense='N', name='max_lineup')

    problem_name = f"GW{gw}_maximin_2_2_pos"
    solve_and_save_to_file(m2, problem_name, data, options)
    comp_values.append(get_sol_summary())
    print(comp_values)


    # Problem 3 - Stage 1 - Maximin for Value

    for i in players:
        x[i].set_value(0)
        z[i].set_value(0)

    m3 = so.Model(name='maximin_per_position')
    m3.include(m)
    w = m3.add_variable(name='lowest_val',vartype=so.CONT)
    max_val = element_df['value'].max()
    m3.add_constraints(
        (w <= x[i] * element_df.loc[i].value + (1-x[i]) * max_val for i in players), name='lowest_val')
    m3.set_objective(-w, sense='N', name='max_min_value')
    problem_name = f"GW{gw}_maximin_3_1_val"
    solve_and_save_to_file(m3, problem_name, data, options)
    comp_values.append(get_sol_summary())
    print(comp_values)

    # Problem 3 - Stage 2

    for i in players:
        x[i].set_value(0)
        z[i].set_value(0)

    m3.add_constraint(w >= w.get_value(), name='w_lb')
    m3.set_objective(-total_lineup_xp, sense='N', name='max_min_value')
    problem_name = f"GW{gw}_maximin_3_2_val"
    solve_and_save_to_file(m3, problem_name, data, options)
    comp_values.append(get_sol_summary())
    print(comp_values)



    # Problem 4 - Stage 1 - Ownership

    for i in players:
        x[i].set_value(0)
        z[i].set_value(0)

    m4 = so.Model(name='maximin_per_position')
    m4.include(m)
    w = m4.add_variable(name='lowest_own',vartype=so.CONT)
    max_own = element_df['selected_by_percent'].max()
    m4.add_constraints(
        (w <= x[i] * element_df.loc[i].selected_by_percent + (1-x[i]) * max_own for i in players), name='lowest_owned')
    m4.set_objective(-w, sense='N', name='max_min_owner')
    problem_name = f"GW{gw}_maximin_4_1_own"
    solve_and_save_to_file(m4, problem_name, data, options)
    comp_values.append(get_sol_summary())
    print(comp_values)

    # Problem 4 - Stage 2

    for i in players:
        x[i].set_value(0)
        z[i].set_value(0)

    m4.add_constraint(w >= w.get_value(), name='w_lb')
    m4.set_objective(-total_lineup_xp, sense='N', name='max_min_value')
    problem_name = f"GW{gw}_maximin_4_2_own"
    solve_and_save_to_file(m4, problem_name, data, options)
    comp_values.append(get_sol_summary())
    print(comp_values)


    comp_values_df = pd.DataFrame(comp_values)
    comp_values_df.to_excel(output_folder / f"GW{gw}_o_ring_summary.xlsx")
    print(comp_values_df)

    return 0


def solve_and_save_to_file(model, problem_name, data, options):

    output_folder = options['output_folder']
    gw = data['gw']
    players = data['elements']
    types = data['types']
    types_df = data['types_df']
    next_week_df = data['element_gameweek_df']
    team_codes = data['team_codes']
    element_df = data['element_df']

    m = model
    mps_str = get_mps_string(m)
    if options.get('name') is not None:
        problem_name += '_' + options['name']
    with open(output_folder / f"{problem_name}.mps", "w") as f:
        f.write(mps_str)
    filename = str(output_folder / f"{problem_name}.mps")
    solutionname = str(output_folder / f"{problem_name}.sol")
    csvname = str(output_folder / f"{problem_name}.csv")
    solve_and_get_solution(filename, solutionname, m)

    variables = m.get_grouped_variables()

    x = variables['lineup']
    z = variables['squad']

    selected_players = []
    for i in players:
        if z[i].get_value() > 0.5 and x[i].get_value() < 0.5:
            selected_players.append([i, gw, 0, False, 0])
        elif x[i].get_value() > 0.5:
            selected_players.append([i, gw, 1, False, 1])
    results = pd.DataFrame(selected_players, columns=['player_id', 'event', 'multiplier', 'is_captain', 'starting_lineup'])
    result_df = pd.merge(next_week_df, results, on=['player_id', 'event'], how='inner')
    result_df = result_df[['player_id', 'web_name', 'team_code', 'element_type', 'now_cost', 'event', 'points_md', 'is_captain', 'multiplier', 'starting_lineup', 'selected_by_percent']].copy()
    result_df['gw_points'] = result_df['multiplier'] * result_df['points_md']
    result_df = result_df.sort_values(by=['starting_lineup', 'element_type', 'player_id'], ascending=[False, True, True], ignore_index=True)
    result_df.reset_index(drop=True, inplace=True)
    result_df.to_csv(csvname, encoding='utf-8')
    with pd.option_context('display.max_rows', None, 'display.max_columns', None, 'display.encoding', 'UTF-8'): 
        print(result_df)
    print(m.get_objective_value())


if __name__ == "__main__":
    # generate_pareto_front_for_gain_loss(16)
    # generate_pareto_front_for_gain_loss(17)
    solve_maximin_problem(16)
