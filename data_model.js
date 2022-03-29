var $projects = load_project_list();
var $settings;

print = console.log;

document.querySelector("#save").onclick = () => {
    let name = document.querySelector("#project-name").innerText;
    let projects = localStorage.getItem("projects");
    projects = projects ? JSON.parse(projects) : {}
    projects[name] = serialize();

    localStorage.setItem("projects", JSON.stringify(projects));
}

function load_project_list()
{
    let result = [];
    let projects = JSON.parse(localStorage.getItem("projects"));
    for (let name in projects)
    {
        projects[name].name = name;
        result.push(projects[name]);
    }
    return result;
}

function default_settings()
{
    return {
        graph_dimensions: parseInt(shape_selector.value),
        resolution: resolution_selector.valueAsNumber,
        settings: [],
        models: [],
        references: [],
        LUTs: {},
        sliders: {},
        variables: {},
    };

}

function serialize()
{
    let serialized = default_settings();
    serialized.graph_dimensions = $settings.graph_dimensions;
    serialized.resolution = $settings.resolution;
    serialized.settings = $settings.settings;

    for (let name in $settings.models)
    {
        let src = $settings.models[name];
        serialized.models.push({
            ref: src.ref,
            code: src.func.toString(),
        });
    }

    for (let name of $settings.references)
    {
        let src = $settings.plots[name];
        serialized.references.push({
            display: src.display,
            code: src.func.toString(),
        });
    }

    for (let name in $settings.LUTs)
    {
        let src = $settings.LUTs[name];
        serialized.LUTs[name] = {
            bilinear: src.bilinear,
            url: src.url,
        };
    }

    for (let src of $settings.sliders)
        serialized.sliders[src.name] = src.value;

    for (let name in $settings.variables)
        serialized.variables[name] = $settings.variables[name].value;

    return serialized;
}

async function deserialize(data)
{
    Object.setPrototypeOf(data, default_settings());

    $settings = {
        graph_dimensions: data.graph_dimensions,
        resolution: data.resolution,
        LUTs: {},
        plots: {},
        models: {},
        settings: {},
        references: [],
        parameter_names: [],
        dimensions: undefined,
        parameters: null,
        variables: {},
        sliders: [],
        sliderElement: document.querySelector('#sliders'),
    };

    shape_selector.value = data.graph_dimensions;
    resolution_selector.value = data.resolution;

    for (let name in data.LUTs)
    {
        let src = data.LUTs[name];
        await add_lut(src.url, name, src.bilinear);
    }

    for (let name in data.settings)
    {
        let src = data.settings[name];
        add_setting(name, src.type, src.initial_value, src.settings);
    }

    for (let src of data.references)
        add_reference(src.code, src.display, false);

    refresh_all_plots();

    for (let name in data.variables)
        get_or_create_variable(name, data.variables[name]);

    for (let src of data.models)
        add_model(src.code, src.ref);
}
