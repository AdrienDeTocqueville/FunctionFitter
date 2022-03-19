(function () {
    'use strict';

    // some utilities for use in models
    function polynom(x)
    {
        let res = arguments[1];
        let x_p = x;
        for (let i = 2; i < arguments.length; i++)
        {
            res += x_p * arguments[i];
            x_p *= x;
        }
        return res;
    }

    function saturate(x)
    {
        return Math.max(0, Math.min(x, 1));
    }

    function lerp(a, t, b)
    {
        return (1 - t) * a + t * b;
    }

    // Error metrics
    function squared_error(fun, X, y, x0)
    {
        let error = 0, n = X.length;
        for (let i = 0; i < n; i++)
            error += Math.pow(fun(X[i], ...x0) - y[i], 2);
        return error;
    }

    function sqrSumOfDeviations(y)
    {
        //variable declarations
        var avg, error, length, i;
        //variable definitions
        error = 0;
        avg = 0;
        length = y.length;
        //find average
        for (i = 0; i < length; i += 1) {
            avg += y[i];
        }
        avg = avg / length;
        //find ssd
        for (i = 0; i < length; i += 1) {
            error += Math.pow(y[i] - avg, 2);
        }
        return error;
    }

    // Non linear least squares implementation
    function lstsq(fun, x0, X, y, options)
    {
        let x1 = x0.splice(); // duplicate array

        let iter = 0, lastError = Infinity;
        for (; iter < options.max_iteration; iter++)
        {
            // Run update step on all parameters
            for (let i = 0; i < x0.length; i++)
            {
                x1[i] += options.step[i];
                if (squared_error(fun, X, y, x1) < squared_error(fun, X, y, x0))
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
            if ((iter % options.update_period) === 0)
            {
                let sse = squared_error(fun, X, y, x0);
                if (Math.abs(1 - sse / lastError) < options.min_error) {
                    break;
                }
                lastError = sse;
            }
        }

        //I added the following 'R^2' like calculation.
        let SSDTot = sqrSumOfDeviations(y);
        let SSETot = squared_error(fun, X, y, x0);
        let corrIsh = 1 - SSETot / SSDTot;

        //Check if fitting converged
        let success = iter;
        if (iter === options.max_iteration && Math.abs(1 - SSETot / lastError) > options.min_error)
            success = 0;

        return {
            ops: options,
            success: success,
            parameters: x0,
            totalSqrErrors: SSETot,
            R2: corrIsh
        };
    }

    self.onmessage = function (event) {

        let data = {
            func: eval("(" + event.data.model + ")"),
            initial_values: event.data.parameters,
            X: event.data.data.x_values,
            y: event.data.data.y_values,
        }

        //variable declarations
        let options = {
            step: [...new Array(data.initial_values.length)].fill(1 / 100),
            max_iteration: 1000,
            min_error: 1e-6,
            update_period: 3,
            converge: 1.2,
            diverge: -0.5
        };

        let result = lstsq(data.func, data.initial_values, data.X, data.y, options);
        self.postMessage({type: "onfinish", data: result});
    };

}());