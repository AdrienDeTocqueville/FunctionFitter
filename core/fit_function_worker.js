/*
{
function squared_error(model, dataset, params)
{
    let x = dataset.x_values, y = dataset.y_values;
    let error = 0, m = x.length;
    for (let i = 0; i < m; i++)
        error += Math.pow(model(x[i], ...params) - y[i], 2);
    return error;
}

function compute_jacobian_numerical(model, dataset, params, predicted, J)
{
    const delta = 1e-4;
    const delta_inv = 1 / delta;

    let x = dataset.x_values;
    let m = dataset.x_values.length;
    let n = params.length;

    for (let i = 0; i < m; i++)
        predicted[i] = model(x[i], ...params);

    for (let j = 0; j < n; j++)
    {
        params[j] += delta;
        for (let i = 0; i < m; i++)
            J[j * m + i] = (model(x[i], ...params) - predicted[i]) * delta_inv;
        params[j] -= delta;
    }
}

function levenberg_marquardt(model, dataset, params, options = {})
{
    const damping = options.damping || 1;
    const errorTolerance = options.errorTolerance || 1e-7;
    const maxIterations = options.maxIterations || 100;

    let error = squared_error(model, data, params);
    let optimalParameters = params.slice();

    let m = dataset.x_values.length, n = params.length;

    let J = new Float32Array(m * n);
    let JtJ = new Float32Array(n * n);
    let predicted = new Float32Array(m);
    let delta = new Float32Array(n);

    for (let i = 0; i < maxIterations && (error > errorTolerance); i++)
    {
        {
            // delta = (JtJ + lambda * I)^-1 * J * (y - predicted)

            // J
            compute_jacobian_numerical(model, dataset, params, predicted, J);

            // JtJ
            for (let r = 0; r < n; ++r)
            {
                // JtJ is symetric, avoid recomputing values
                for (let c = 0; c < r; ++c)
                    JtJ[r * n + c] = JtJ[c * n + r];

                for (let c = r; c < n; ++c)
                {
                    let sum = 0;
                    for (let j = 0; j < m; ++j)
                        sum += J[r * m + j] * J[c * m + j];
                    JtJ[r * n + c] = sum;
                }
            }
        }

        //{
        //    let residualError = matrixFunction(dataset, predicted);

        //    let inverseMatrix = inverse(
        //        identity.add(
        //            gradientFunc.mmul(
        //                gradientFunc.transpose().scale('row', { scale: weights }),
        //            ),
        //        ),
        //    );
        //}


        // Update params & recompute error
        for (let j = 0; j < params.length; j++)
            params[j] += delta[j];

        let new_error = squared_error(model, data, params);

        if (new_error < error)
        {
            error = new_error;
            damping = Math.max(damping / 10, 1e-7);
            for (let j = 0; j < params.length; j++)
                optimalParameters[j] = params[j];
        }
        else
            damping = Math.min(damping * 10, 1e7);
    }

    return optimalParameters;
}
}
*/


'use strict';

importScripts("../utils/math_lib.js");

// Fitting function from https://github.com/adussaq/amd_cf
function lstsq(model, initial_values, dataset, options)
{
    // Error metric
    let x0 = initial_values;
    let x1 = initial_values.splice();

    let iter = 0, lastError = Infinity;
    for (; iter < options.max_iteration; iter++)
    {
        // Run update step on all parameters
        for (let i = 0; i < x0.length; i++)
        {
            x1[i] += options.step[i];
            if (squared_error(model, dataset, x1) < squared_error(model, dataset, x0))
            {
                x0[i] = x1[i];
                options.step[i] *= options.converge;
            }
            else
            {
                x1[i] = x0[i];
                options.step[i] *= options.diverge;
            }
        }

        // Check termination condition
        //if ((iter % options.update_period) === 0)
        //{
        //    let sse = squared_error(model, dataset, x0);
        //    if (Math.abs(1 - sse / lastError) < options.min_error) {
        //        break;
        //    }
        //    lastError = sse;
        //    options.onstep(model.name, x0);
        //}
    }

    return x0;
}

function fit_function(model, initial_values, dataset, onstep)
{
    let options = {
        step: [...new Array(initial_values.length)].fill(1 / 100),
        max_iteration: 1000,
        min_error: 1e-6,
        update_period: 50,
        converge: 1.2,
        diverge: -0.5,
        onstep,
    };

    if (onstep == null) options.update_period = options.maxIterations;

    return lstsq(model, initial_values, dataset, options);
}


if (typeof WorkerGlobalScope === 'undefined')
{
    window.fit_function_sync = (model, dataset, onstep) =>
    {
        let values = new Array(model.variables.length);
        for (let i = 0; i < model.variables.length; i++)
            values[i] = model.variables[i].value;

        return fit_function(model.func, values, dataset, onstep);
    };
}
else
{
    self.onmessage = function (event)
    {
        for (let name in event.data.globals)
        {
            let value = event.data.globals[name];
            if (typeof value == "string")
                self[name] = eval("(" + value + ")");
            else
                self[name] = value;
        }

        let model = eval("(" + event.data.model + ")");
        let initial_values = event.data.initial_values;
        let dataset = event.data.dataset;

        let onstep = (name, payload) => {
            self.postMessage({type: "onstep", name, payload});
        };

        let result = fit_function(model, initial_values, dataset, onstep);
        self.postMessage({
            type: "onfinish",
            name: model.name,
            payload: result,
        });
        self.close();
    };
}
