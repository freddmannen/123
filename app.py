from flask import Flask, render_template, request, jsonify
from beam_solver import BeamSolver
from pillar_solver import PillarSolver
from frame_solver import FrameSolver
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.DEBUG)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.json
        app.logger.info(f"Received calculation request: {data}")
        
        length = float(data.get('length', 10))
        E = float(data.get('E', 200e9)) # 200 GPa default
        I = float(data.get('I', 0.0001)) # Default I
        
        solver = BeamSolver(length, E, I)
        
        supports = data.get('supports', [])
        for s in supports:
            solver.add_support(s['pos'], s['type'])
            
        loads = data.get('loads', [])
        for l in loads:
            solver.add_load(l['pos'], l['magnitude'])

        dist_loads = data.get('dist_loads', [])
        for dl in dist_loads:
            solver.add_dist_load(dl['start'], dl['end'], dl['magnitude'])
            
        result = solver.solve()
        
        return jsonify({'status': 'success', 'data': result})
        
    except Exception as e:
        app.logger.error(f"Error in calculation: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/calculate_pillar', methods=['POST'])
def calculate_pillar():
    try:
        data = request.json
        app.logger.info(f"Received pillar request: {data}")
        
        solver = PillarSolver(
            length=data.get('length'),
            E=data.get('E'),
            I=data.get('I'),
            A=data.get('A'),
            k_factor_type=data.get('k_type')
        )
        
        result = solver.solve()
        return jsonify({'status': 'success', 'data': result})
        
    except Exception as e:
        app.logger.error(f"Error in pillar calculation: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/calculate_frame', methods=['POST'])
def calculate_frame():
    try:
        data = request.json
        app.logger.info(f"Received frame request: {data}")
        
        solver = FrameSolver()
        
        for node in data.get('nodes', []):
            solver.add_node(node['id'], node['x'], node['y'])
            
        for elem in data.get('elements', []):
            solver.add_element(elem['id'], elem['n1'], elem['n2'], elem['E'], elem['A'], elem['I'])
            
        for supp in data.get('supports', []):
            solver.add_support(supp['node'], supp['type'])
            
        for load in data.get('loads', []):
            solver.add_load(load['node'], load['fx'], load['fy'], load['m'])
            
        result = solver.solve()
        return jsonify({'status': 'success', 'data': result})
        
    except Exception as e:
        app.logger.error(f"Error in frame calculation: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)
