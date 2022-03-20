// C:\Users\adrien.tocqueville\AppData\Local\Programs\Opera\launcher.exe --allow-file-access-from-files

if ($projects.length != 0)
    deserialize($projects[0]);
else
{
    function model_f (x, a0, b0, c0, a1, b1, c1)
    {
        let [NdotV, roughness] = x;
        let b = polynom(roughness, a0, b0, c0);
        let d = polynom(roughness, a1, b1, c1);
        return polynom(NdotV - 0.74, 0, b, 0, d);
    }
    function fgd_ref(NdotV, roughness)
    {
        if (TRANSFORM_FGD)
        {
            if (FGD_LAYER == 0)
            {
                if (roughness < 0.02 && NdotV <= 0.6)
                    return fgd_lazarov(NdotV, roughness);
                if (NdotV > 0.6)
                    return 2*fgd_ref(0.6, roughness) - fgd_ref(0.6-(NdotV-0.6), roughness);
            }
            if (FGD_LAYER == 1 && roughness < 0.4 && NdotV < 0.07)
                return 1;
        }
        return sample_lut("FGD", Math.sqrt(NdotV), 1 - roughness, FGD_LAYER);
    }
    function fgd_lazarov(NdotV, roughness)
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
    }

    async function main()
    {
        await add_lut("FGD_64.png", "FGD");
        add_setting("TRANSFORM_FGD", "checkbox", true);
        add_setting("FGD_LAYER", "number", 0 , {values: ["F", "G", "D"], dropdown: false});
        add_reference(fgd_ref, true);
        add_reference(fgd_lazarov, false);
        add_model(model_f);
    }
    main()
}

function generate_dataset(func)
{
    let resolution = 4;
    let axis1, axis2;
    let dimensions = $settings.dimensions - 1;
    let num_sliders = $settings.dimensions - $settings.graph_dimensions;

    let px = new Array(Math.pow(resolution, $settings.graph_dimensions-1));
    for (let i = 0; i < px.length; i++)
        px[i] = new Array(dimensions);

    for (let i = 0; i < dimensions; i++)
    {
        let param = $settings.parameters[i];
        if (param.active != -1) // value is from slider
        {
            for (let j = 0; j < px.length; j++)
                px[j][i] = param.value;
        }
        else if (axis1 == undefined) axis1 = i;
        else if (axis2 == undefined) axis2 = i;
    }

    if ($settings.graph_dimensions == 2)
    {
        for (let j = 0; j < resolution; j++)
            px[j][axis1] = j / (resolution - 1);
    }
    else
    {
        for (let j = 0; j < resolution; j++)
        {
            for (let k = 0; k < resolution; k++)
            {
                px[j*resolution+k][axis1] = k / (resolution - 1);
                px[j*resolution+k][axis2] = j / (resolution - 1);
            }
        }
    }

    let py = null;
    if (func != undefined)
    {
        py = new Array(px.length);
        for (let i = 0; i < px.length; i++)
            py[i] = func(...px[i]);
    }

    return { x_values: px, y_values: py, axis1, axis2, resolution };
}

function fit_function(model, dataset, onstep, onfinish)
{
    if (this.worker == null)
    {
        this.jobs = {};
        this.worker = new Worker("fit_function_worker.js");
        this.worker.onerror = (e) => console.error(e);
        this.worker.onmessage = (event) => {

            let job = this.jobs[event.data.name];
            if (event.data.type == "onfinish")
                delete this.jobs[event.data.name];

            let variables = job.model.variables;
            for (let i = 0; i < variables.length; i++)
            {
                variables[i].value = event.data.payload[i];
                variables[i].refresh_input();
            }

            job.model.rebuild_model();
            job[event.data.type](event.data.payload);
        };
    }

    let values = new Array(model.variables.length);
    for (let i = 0; i < model.variables.length; i++)
        values[i] = model.variables[i].value;

    let job = {
        model,
        onstep,
        onfinish,
    }

    let job_data = {
        model: model.func.toString(),
        parameters: values,
        dataset,
    };

    this.jobs[model.func.name] = job;
    this.worker.postMessage(job_data);
}
