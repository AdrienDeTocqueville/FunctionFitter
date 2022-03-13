// C:\Users\adrien.tocqueville\AppData\Local\Programs\Opera>launcher.exe --allow-file-access-from-files
var model_f = `function model_f(x, a, b, c)
{
    let [NdotV, roughness] = x;
    return polynom(roughness, a, b, c);
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
    add_variable("FGD_LAYER", "number", 0);
    add_model(model_f);
    add_reference(fgd_ref, true);
    add_reference(fgd_lazarov, false);
}
main()


function loss(estimate, target)
{
}

const learningRate = 0.1;
const optimizer = tf.train.adam(learningRate);

let intervalId;
function fit_function()
{
    intervalId = setInterval(training_step, 100);
}

function training_step()
{
    let model = $settings.models["model_f"];
    let ref = $settings.plots["fgd_ref"];

    var error = tf.tidy(() => {

        let tmp_array = new Array(ref.data.x.length);

        let px = new Array($settings.dimensions - 1);
        let py = tf.tensor(ref.data.y);

        let parameters = new Array($settings.dimensions - 1);
        let num_sliders = $settings.dimensions - $settings.graph_dimensions;
        for (let i = 0; i < px.length; i++)
        {
            let param = $settings.parameters[i];
            if (param.active == -1)
                px[i] = tf.tensor(ref.data.x);
            else
            {
                tmp_array.fill(param.value);
                px[i] = tf.tensor(tmp_array);
            }
        }

        let loss = () => {
            let ppx = model.predict(px);
            return ppx.sub(py).square().mean();
        }

        for (let i = 0; i < 100; i++)
            optimizer.minimize(loss, false);

        return optimizer.minimize(loss, true).dataSync();
    });

    $settings.plots["model_f"].data = null;
    redraw_plots();

    if (training_step.prev_error != null)
    {
        console.log(`error: ${error}  delta: ${Math.abs(training_step.prev_error - error)}   -- leak: ${tf.memory().numTensors}`);

        if (Math.abs(training_step.prev_error - error) < 0.0001)
        {
            console.log("Stopping fitting");
            clearInterval(intervalId);
            training_step.prev_error = null;
            return;
        }
    }
    training_step.prev_error = error;
}
