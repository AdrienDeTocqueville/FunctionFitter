// C:\Users\adrien.tocqueville\AppData\Local\Programs\Opera\launcher.exe --allow-file-access-from-files

function generate_dataset(func)
{
    let resolution = $settings.resolution;

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

    let param1 = $settings.parameters[axis1];
    let param2 = $settings.parameters[axis2];

    if ($settings.graph_dimensions == 2)
    {
        let offset = param1.range[0], range = param1.range[1] - param1.range[0];
        for (let j = 0; j < resolution; j++)
            px[j][axis1] = offset + range * j / (resolution - 1);
    }
    else
    {
        let offset1 = param1.range[0], range1 = param1.range[1] - param1.range[0];
        let offset2 = param2.range[0], range2 = param2.range[1] - param2.range[0];
        for (let j = 0; j < resolution; j++)
        {
            for (let k = 0; k < resolution; k++)
            {
                px[j*resolution+k][axis1] = offset1 + range1 * k / (resolution - 1);
                px[j*resolution+k][axis2] = offset2 + range2 * j / (resolution - 1);
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

    let parameters = new Array(model.variables.length);
    for (let i = 0; i < model.variables.length; i++)
        parameters[i] = model.variables[i].value;

    let globals = {};
    for (let name in $settings.settings)
    {
        if (!window[name] instanceof Function)
            globals[name] = window[name];
    }
    for (let name in $settings.plots)
        globals[name] = window[name].toString();

    let job = {
        model,
        onstep,
        onfinish,
    }

    this.jobs[model.func.name] = job;
    this.worker.postMessage({ model: model.func.toString(), parameters, dataset, globals });
}
