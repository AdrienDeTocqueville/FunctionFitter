// C:\Users\adrien.tocqueville\AppData\Local\Programs\Opera>launcher.exe --allow-file-access-from-files

var model_f = `function model_f(x, a0, b0, c0, a1, b1, c1)
{
    let [NdotV, roughness] = x;
    let b = polynom(roughness, a0, b0, c0);
    let d = polynom(roughness, a1, b1, c1);
    return polynom(NdotV.add(-0.74), tf.scalar(0), b, tf.scalar(0), d);
}`;
var fgd_ref = `function fgd_ref(NdotV, roughness)
{
    return sample_lut("FGD", Math.sqrt(NdotV), 1 - roughness, FGD_LAYER);
}`;
var fgd_lazarov = `function fgd_lazarov(NdotV, roughness)
{
    let x = (1-roughness)*(1-roughness);
    let y = NdotV;

    let b1 = -0.1688;
    let b2 = 1.895;
    let b3 = 0.9903;
    let b4 = -4.853;
    let b5 = 8.404;
    let b6 = -5.069;
    let bias = saturate( Math.min( b1 * x + b2 * x * x, b3 + b4 * y + b5 * y * y + b6 * y * y * y ) );

    let d0 = 0.6045;
    let d1 = 1.699;
    let d2 = -0.5228;
    let d3 = -3.603;
    let d4 = 1.404;
    let d5 = 0.1939;
    let d6 = 2.661;
    let delta = saturate( d0 + d1 * x + d2 * y + d3 * x * x + d4 * x * y + d5 * y * y + d6 * x * x * x );
    return [bias, delta, 1][FGD_LAYER];
}`;

function polynom(x)
{
    let res = arguments[1];
    let x_p = x;
    for (let i = 2; i < arguments.length; i++)
    {
        res = res.add(x_p.mul(arguments[i]));
        x_p = x_p.mul(x);
    }
    return res;
}

function random(min, max)
{
    return Math.random() * (max - min) + min;
}

function saturate(x)
{
    return Math.max(0, Math.min(x, 1));
}

function lerp(a, t, b)
{
    return (1 - t) * a + t * b;
}

function truncate(x, precision=2)
{
    return Number(x.toFixed(precision))
}

async function main()
{
    await add_lut("FGD_64.png", "FGD");
    add_variable("TRANSFORM_FGD", "checkbox", false);
    add_variable("FGD_LAYER", "number", 0 , {values: ["F", "G", "D"], dropdown: false});
    add_model(model_f);
    add_reference(fgd_ref, true);
    add_reference(fgd_lazarov, false);
}
main()


const learningRate = 0.1;
const fitThreshold = 0.0001;
const optimizer = tf.train.adam(learningRate);

function generate_dataset(ref)
{
    let [inputs, resolution, axis_x, axis_y] = generate_parameters();

    if ($settings.graph_dimensions == 2)
    {
        return tf.tidy(() => {
            let px = new Array(inputs.length);

            let parameters = new Array(inputs.length);
            let tmp_array = new Array(resolution);
            for (let i = 0; i < px.length; i++)
            {
                if (!Array.isArray(inputs[i]))
                {
                    tmp_array.fill(inputs[i]);
                    px[i] = tf.tensor(tmp_array);
                    parameters[i] = inputs[i];
                }
                else
                    px[i] = tf.tensor(inputs[i]);

                px[i] = tf.keep(px[i]);
            }

            for (let i = 0; i < resolution; i++)
            {
                parameters[axis_x] = inputs[axis_x][i];
                tmp_array[i] = ref(...parameters);
            }
            let py = tf.keep(tf.tensor(tmp_array));

            return { x: px, y: py };
        });
    }
    else
    {
        return tf.tidy(() => {
            let px = new Array(inputs.length);

            let parameters = new Array(inputs.length);
            let tmp_array = new Array(resolution*resolution);
            for (let i = 0; i < px.length; i++)
            {
                if (!Array.isArray(inputs[i]))
                {
                    tmp_array.fill(inputs[i]);
                    parameters[i] = inputs[i];
                }
                else if (i == axis_x)
                {
                    for (let j = 0; j < resolution; j++)
                    {
                        for (let k = 0; k < resolution; k++)
                            tmp_array[j*resolution+k] = inputs[i][k];
                    }
                }
                else if (i == axis_y)
                {
                    for (let j = 0; j < resolution; j++)
                    {
                        for (let k = 0; k < resolution; k++)
                            tmp_array[j*resolution+k] = inputs[i][j];
                    }
                }

                px[i] = tf.keep(tf.tensor(tmp_array));
            }

            for (let i = 0; i < resolution; i++)
            {
                parameters[axis_x] = inputs[axis_x][i];
                for (let j = 0; j < resolution; j++)
                {
                    parameters[axis_y] = inputs[axis_y][j];
                    tmp_array[i*resolution+j] = ref(...parameters);
                }
            }
            let py = tf.keep(tf.tensor(tmp_array));

            return { x: px, y: py };
        });
    }
}

function training_step(model, dataset, onFinish)
{
    $settings.plots[model].data = null;
    model = $settings.models[model];

    var error = tf.tidy(() => {

        let loss = () => {
            let ppx = model.predict(dataset.x);
            return ppx.sub(dataset.y).square().mean();
        }

        //for (let i = 0; i < 100; i++)
        //    optimizer.minimize(loss, false);

        return optimizer.minimize(loss, true).dataSync();
    });

    redraw_plots();

    //console.log(tf.memory().numTensors);
    let fitted = error < 0.001 && Math.abs(model.error - error) < fitThreshold;
    //fitted = true;
    model.error = error;
    if (fitted) onFinish();
}
