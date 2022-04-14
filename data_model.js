var $settings, $projects;
var print = console.log;
let loaded_project = null;

$projects = load_projects();
refresh_project_list();

set_theme(localStorage.getItem('theme'));
deserialize({});

// Modal
document.querySelector("#project-name").onclick = () => {
    document.querySelector("#modal input").value = loaded_project || "";
    let previous_name = loaded_project;
    open_modal(() => {
        if ($projects[previous_name])
        {
            $projects[loaded_project] = $projects[previous_name];
            delete $projects[previous_name];
            save_projects();
        }
    });
    document.querySelector("#modal input").focus();
}
document.querySelector("#modal input").onkeyup = (e) => {
    if (e.key == "Enter")  document.querySelector("#modal button").click();
    if (e.key == "Escape") document.querySelector("#modal .close").click();
};
document.querySelector("#modal button").onclick = () => {
    let name = document.querySelector("#modal input").value;
    document.querySelector("#modal input").value = "";
    if (/^\s*$/.test(name)) return; // empty
    document.querySelector("#project-name").innerText = loaded_project = name;
    close_modal();
};

document.querySelector("#save").onclick = () => {
    if (loaded_project == null)
    {
        open_modal(save_project);
        document.querySelector("#modal input").focus();
    }
    else
        save_project();
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
    refresh_project_list();
}
function save_project()
{
    $projects[loaded_project] = serialize();
    save_projects();
}
function delete_project(name)
{
    delete $projects[name];
    if (name == loaded_project)
        deserialize({});

    save_projects();
}

function default_settings()
{
    return {
        graph_dimensions: 2,
        resolution: 64,
        settings: {},
        models: [],
        references: [],
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

    for (let name in $settings.settings)
    {
        let src = $settings.settings[name];
        if (src.type == 'lut')
        {
            serialized.settings[name] = {
                type: src.type,
                bilinear: src.settings.bilinear,
                url: src.settings.url,
            };
        }
        else
        {
            serialized.settings[name] = src;
        }
    }

    if ($settings.parameters)
    {
        for (let src of $settings.parameters)
            serialized.parameters[src.name] = {
                value: src.value,
                range: src.range,
                resolution: src.resolution
            };
    }

    for (let name in $settings.variables)
        serialized.variables[name] = $settings.variables[name].value;

    return serialized;
}

function deserialize(data)
{
    data = data || {};
    Object.setPrototypeOf(data, default_settings());

    loaded_project = data.name;

    // Unload current project

    document.querySelector("#sliders").innerHTML = "";
    document.querySelector("#variable_list").innerHTML = "";
    document.querySelector("#settings_list").innerHTML = "";
    document.querySelector("#model_list").innerHTML = "";
    document.querySelector("#reference_list").innerHTML = "";

    if ($settings)
    {
        for (let name in $settings.settings)
            delete window[name];
        for (let name in $settings.plots)
            delete window[name];
    }

    $settings = {
        graph_dimensions: data.graph_dimensions,
        resolution: data.resolution,
        plots: {},
        models: {},
        settings: {},
        references: [],
        parameter_names: [],
        dimensions: undefined,
        parameters: undefined,
        variables: {},
        sliders: [],
        sliderElement: document.querySelector('#sliders'),
    };

    // Load

    document.querySelector("#project-name").innerText = loaded_project || "Unnamed Project";
    shape_selector.value = data.graph_dimensions;
    resolution_selector.value = data.resolution;

    for (let name in data.settings)
    {
        let src = data.settings[name];
        if (src.type == 'lut') add_lut(name, src.url, src.bilinear);
        else add_setting(name, src.type, src.initial_value, src.settings);
    }

    for (let src of data.references)
        add_reference(src.code, src.display, false);

    for (let name in data.variables)
        get_or_create_variable(name, data.variables[name]);

    for (let src of data.models)
        add_model(src.code, src.ref);

    if ($settings.parameters != undefined)
    {
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
    }

    rebuild_ranges();
}
