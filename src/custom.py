#!/usr/bin/python3

import pandas as pd
import sasoptpy as so

from collect import get_all_data
from solve import solve_and_get_solution, get_mps_string


def solve_custom_problem(input_folder, output_folder, options):
    """Solves a custom optimization problem"""

    problem_name = options['name']

    df = pd.read_csv(input_folder / 'element_gameweek.csv')
    target_week = options.get('target_week', df['event'].min())
    target_week_df = df[df['event'] == target_week].copy()

    df = pd.read_csv(input_folder / 'element.csv')
    target_week_df = pd.merge(left=target_week_df, right=df, how='inner', left_on=['player_id'], right_on=['id'], suffixes=('', '_extra'))
    players = target_week_df['player_id'].unique().tolist()
    target_week_df.set_index('player_id', inplace=True, drop=True)
    target_week_df = target_week_df.groupby(target_week_df.index).first()

    team_codes = target_week_df['team_code'].unique().tolist()
    
    types_df = pd.read_csv(input_folder / 'element_type.csv')
    types = types_df['id'].to_list()
    types_df.set_index('id', inplace=True, drop=True)

    m = so.Model(name=problem_name, session=None)
    x = m.add_variables(players, name='lineup', vartype=so.BIN)
    y = m.add_variables(players, name='captain', vartype=so.BIN)
    z = m.add_variables(players, name='squad', vartype=so.BIN)

    m.add_constraint(so.quick_sum(x[i] for i in players) == 11, name='lineup_limit')
    m.add_constraints((
        so.quick_sum(x[i] for i in players if target_week_df.loc[i]['element_type'] == et) >= types_df.loc[et]['squad_min_play']
        for et in types), name='squad_min')
    m.add_constraints((
        so.quick_sum(x[i] for i in players if target_week_df.loc[i]['element_type'] == et) <= types_df.loc[et]['squad_max_play']
        for et in types), name='squad_max')
    m.add_constraint(so.quick_sum(y[i] for i in players) == 1, name='single_captain')
    m.add_constraints((y[i] <= x[i] for i in players), name='captain_should_play')

    # Limit constraints
    m.add_constraints((
        so.quick_sum(z[i] for i in players if target_week_df.loc[i]['element_type'] == et) == types_df.loc[et]['squad_select']
        for et in types), name='squad_exact')
    m.add_constraint(so.quick_sum(z[i] for i in players) == 15, name='squad_limit')
    m.add_constraints(
        (so.quick_sum(z[i] for i in players if target_week_df.loc[i]['team_code'] == j) <= 3 for j in team_codes),
        name='player_team_limit')
    m.add_constraint(
        so.quick_sum(z[i] * target_week_df.loc[i]['now_cost'] for i in players) <= options['budget']*10,
        name='total_cost_100')
    m.add_constraints(
        (x[i] <= z[i] for i in players), name='lineup_squad_con')

    obj_type = options['objective']

    if obj_type == 'lineup':
        m.set_objective(so.quick_sum(
            -target_week_df.loc[i]['points_md'] * (x[i]+y[i]) for i in players
        ), sense='N', name='maximize_lineup_points')
    elif obj_type == 'bb':
        m.set_objective(so.quick_sum(
            -target_week_df.loc[i]['points_md'] * (z[i]+y[i]) for i in players
        ), sense='N', name='maximize_bb_points')

    mps_str = get_mps_string(m)

    with open(output_folder / f"{problem_name}.mps", "w") as f:
        f.write(mps_str)
    
    filename = str(output_folder / f"{problem_name}.mps")
    solutionname = str(output_folder / f"{problem_name}.sol")
    csvname = str(output_folder / f"{problem_name}.csv")
    xlsname = str(output_folder / f"{problem_name}.xlsx")
    
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
    result_df = pd.merge(target_week_df, results, on='player_id', how='inner')
    result_df = result_df[['player_id', 'web_name', 'team_code', 'element_type', 'now_cost', 'event', 'points_md', 'is_captain', 'multiplier', 'starting_lineup', 'selected_by_percent']].copy()
    result_df['gw_points'] = result_df['multiplier'] * result_df['points_md']
    result_df = result_df.sort_values(by=['starting_lineup', 'element_type', 'player_id'], ascending=[False, True, True], ignore_index=True)
    result_df.reset_index(drop=True, inplace=True)
    result_df.to_csv(csvname, encoding='utf-8')
    result_df.to_excel(xlsname, encoding='utf-8')
    with pd.option_context('display.max_rows', None, 'display.max_columns', None, 'display.encoding', 'UTF-8'): 
        print(result_df)
    print(m.get_objective_value())


def solve_multiperiod(input_folder, output_folder, options):
    """Solves for best squads iteratively for generating an interactive list"""
    df = pd.read_csv(input_folder / 'element_gameweek.csv')
    if options.get('target_weeks') is None:
        next_week = df['event'].min()
        element_gameweek_df = df[df['event'] < next_week+3].copy()
    else:
        element_gameweek_df = df[df['event'].isin(options.get('target_weeks'))].copy()

    df = pd.read_csv(input_folder / 'element.csv')
    element_df = df.copy().set_index('id')
    element_gameweek_df = pd.merge(left=element_gameweek_df, right=df, how='inner', left_on=['player_id'], right_on=['id'], suffixes=('', '_extra'))
    element_gameweek_df['rawxp'] = element_gameweek_df.apply(lambda r: r['points_md'] * 90 / max(1, r['xmins_md']), axis=1)
    elements = element_gameweek_df['player_id'].unique().tolist()
    gameweeks = element_gameweek_df['event'].unique().tolist()
    total_weeks = len(gameweeks)
    copy_gw_df = element_gameweek_df.copy()
    copy_gw_df = copy_gw_df.groupby(['player_id', 'event']).first().reset_index()
    element_gameweek_df.set_index(['player_id', 'event'], inplace=True, drop=True)
    element_gameweek_df = element_gameweek_df.groupby(element_gameweek_df.index).first()
    

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
    budget_con = m.add_constraint(so.quick_sum(squad[e] * element_df.loc[e]['now_cost'] for e in elements) <= options.get('budget', 100) * 10, name='budget_con')

    total_points = so.quick_sum(element_gameweek_df.loc[[(e,g)]].iloc[0]['points_md'] * (lineup[e, g]+ captain[e,g]) for e in elements for g in gameweeks)
    
    m.set_objective(-total_points,
        sense='N', name='maximize_points')

    name = options['name']

    filename = str(output_folder / f"{name}.mps")
    solutionname = str(output_folder / f"{name}.sol")
    csvname = str(output_folder / f"{name}.csv")
    xlsname = str(output_folder / f"{name}.xlsx")
    
    mps_str = get_mps_string(m)
    with open(output_folder / f"{name}.mps", "w") as f:
        f.write(mps_str)

    for v in m.get_variables():
        v.set_value(0)

    solve_and_get_solution(filename, solutionname, m)

    # Parse solution
    selected_players = []
    solution = {"squad":[], "lineup": {g:[] for g in gameweeks}, "bench": {g:{} for g in gameweeks}, "captain": {g: 0 for g in gameweeks}, "ownership": {}}
    for e in elements:
        if squad[e].get_value() > 0.5:
            solution['squad'].append(e)
    for g in gameweeks:
        for e in elements:
            if squad[e].get_value() > 0.5:
                if captain[e, g].get_value() > 0.5:
                    solution['captain'][g] = e
                    selected_players.append([g, e, 2, True, 1])
                elif lineup[e, g].get_value() > 0.5:
                    solution['lineup'][g].append(e)
                    selected_players.append([g, e, 1, False, 1])
                elif squad[e].get_value() > 0.5:
                    for p in position:
                        if bench[e, g, p].get_value() > 0.5:
                            solution['bench'][g][p] = e
                            selected_players.append([g, e, 0, False, 0])

    print(solution)
    results = pd.DataFrame(selected_players, columns=['event', 'player_id', 'multiplier', 'is_captain', 'starting_lineup'])
    result_df = pd.merge(copy_gw_df, results, on=['player_id', 'event'], how='inner')
    result_df = result_df[['event', 'player_id', 'web_name', 'team_code', 'element_type', 'now_cost', 'points_md', 'is_captain', 'multiplier', 'starting_lineup', 'selected_by_percent']].copy()
    result_df = result_df.sort_values(by=['event', 'starting_lineup', 'element_type', 'player_id'], ascending=[True, False, True, True], ignore_index=True)
    result_df.reset_index(drop=True, inplace=True)
    result_df.to_csv(csvname, encoding='utf-8')
    result_df.to_excel(xlsname, encoding='utf-8')
    with pd.option_context('display.max_rows', None, 'display.max_columns', None, 'display.encoding', 'UTF-8'): 
        print(result_df)
    print(m.get_objective_value())


if __name__ == "__main__":
    input_folder, output_folder = get_all_data()

    options = {
        'name': 'BGW18-11',
        'budget': 101,
        'target_week': 18,
        'objective': 'lineup'
    }
    solve_custom_problem(input_folder, output_folder, options)
    
    options = {
        'name': 'DGW19-15',
        'budget': 101,
        'target_week': 19,
        'objective': 'bb'
    }
    solve_custom_problem(input_folder, output_folder, options)

    options = {
        'name': 'GW16-19-15',
        'budget': 101,
        'target_weeks': [16, 17, 19]
    }
    solve_multiperiod(input_folder, output_folder, options)