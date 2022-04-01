var $settings, $projects = load_projects();
var print = console.log;
let loaded_project = null;

set_theme(localStorage.getItem('theme'));
deserialize({});

// Modal
document.querySelector("#project-name").onclick = () => {
    open_modal();
}
document.querySelector("#modal button").onclick = () => {
    loaded_project = document.querySelector("#modal input").value;
    document.querySelector("#project-name").innerText = loaded_project;
    close_modal();
};

document.querySelector("#save").onclick = () => {
    if (loaded_project == null) return open_modal();
    $projects[loaded_project] = serialize();
    save_projects();
}

// Theme
document.querySelector("#switch-theme").onclick = () => set_theme(1 - $settings.theme);

// Serialization
function load_projects()
{
    let result = {};
    let projects = JSON.parse(localStorage.getItem("projects"));
    if (projects != null)
        for (let proj of projects)
            result[proj.name] = proj;
    return result;
}
function save_projects()
{
    let result = [];
    for (let name in $projects)
    {
        $projects[name].name = name;
        result.push($projects[name]);
    }
    localStorage.setItem("projects", JSON.stringify(result));
}

function default_settings()
{
    return {
        graph_dimensions: 2,
        resolution: 64,
        settings: [],
        models: [],
        references: [],
        LUTs: {},
        parameters: {},
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

    for (let src of $settings.parameters)
        serialized.parameters[src.name] = {
            value: src.value,
            range: src.range,
            resolution: src.resolution
        };

    for (let name in $settings.variables)
        serialized.variables[name] = $settings.variables[name].value;

    return serialized;
}

function deserialize(data)
{
    Object.setPrototypeOf(data, default_settings());

    loaded_project = data.name;

    // Unload current project

    document.querySelector("#sliders").innerHTML = "";
    document.querySelector("#variable_list").innerHTML = "";
    document.querySelector("#lut_list").innerHTML = "";
    document.querySelector("#model_list").innerHTML = "";
    document.querySelector("#reference_list").innerHTML = "";

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

    // Load

    document.querySelector("#project-name").innerText = loaded_project || "Unnamed Project";
    shape_selector.value = data.graph_dimensions;
    resolution_selector.value = data.resolution;

    for (let name in data.LUTs)
    {
        let src = data.LUTs[name];
        add_lut(src.url, name, src.bilinear);
    }

    for (let name in data.settings)
    {
        let src = data.settings[name];
        add_setting(name, src.type, src.initial_value, src.settings);
    }

    for (let src of data.references)
        add_reference(src.code, src.display, false);

    for (let name in data.variables)
        get_or_create_variable(name, data.variables[name]);

    for (let src of data.models)
        add_model(src.code, src.ref);

    for (let name in data.parameters)
    {
        for (let param of $settings.parameters)
        {
            if (param.name == name)
            {
                param.value = data.parameters[name].value;
                param.range = data.parameters[name].range;
                param.resolution = data.parameters[name].resolution;
            }
        }
    }

    rebuild_ranges();
}
