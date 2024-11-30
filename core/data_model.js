let $projects;
var print = console.log;
let loaded_project = null;

$projects = load_projects();
refresh_project_list();

set_theme(localStorage.getItem('theme'));
deserialize($projects[localStorage.getItem('last-project')]);

// Modal
function project_modal_content (callback)
{
    let content = document.createElement("div");
    content.className = "single-line";
    content.innerHTML = `
        <input class="form-control" type="text" value="${loaded_project || ""}">
        <button class="btn btn-success" style="padding-left: 15px 0; margin-left: 10px;">Save</button>
    `;

    content.querySelector("input").onkeyup = (e) => {
        if (e.key == "Enter")  document.querySelector("#modal button").click();
        if (e.key == "Escape") Modal.close();
    };

    content.querySelector("button").onclick = () => {
        let name = document.querySelector("#modal input").value;
        if (/^\s*$/.test(name)) return; // empty
        set_project_name(name);
        Modal.close();
        callback();
    }

    return content;
}

document.querySelector("#project-name").onclick = () => {
    let previous_name = loaded_project;
    Modal.open("Rename Project", project_modal_content(() => {
        if ($projects[previous_name])
        {
            $projects[loaded_project] = $projects[previous_name];
            delete $projects[previous_name];
            save_projects();
        }
    }));
    document.querySelector("#modal input").focus();
}

document.querySelector("#save").onclick = () => {
    if (loaded_project == null)
    {
        Modal.open("Save As", project_modal_content(save_project));
        document.querySelector("#modal input").focus();
    }
    else
        save_project();
}

// Theme
document.querySelector("#switch-theme").onclick = () => set_theme();

// Serialization
function set_project_name(name)
{
    document.querySelector("#project-name").innerText = loaded_project = name;
    localStorage.setItem('last-project', name);
    print(name);
}

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
        deserialize();

    save_projects();
}

function serialize()
{
    let serialized = {
        settings: {},
        expressions: [],
        variables: [],
        models: {},
        plots: {},
        sheets: {},
    };

    for (let name in Setting.instances)
    {
        let src = Setting.instances[name];
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
            let other = {...src};
            other.settings = {...src.settings};
						delete other.name;
            delete other.settings.label;
            delete other.settings.id;
            if (Object.keys(settings).length !== 0)
                delete other.settings;
            serialized.settings[name] = other;
        }
    }

    for (let name in Expression.instances)
    {
        let expr = Expression.instances[name];
        if (expr.is_function)
            serialized.expressions.push(expr.source);
    }

    let variables = new Set()
    for (let name in Variable.instances)
        variables.add(Variable.instances[name]);
    variables = Variable.sort_by_dependency(variables);
    for (let variable of variables)
    {
        serialized.variables.push({
            name: variable.name,
            min: variable.min,
            max: variable.max,
            res: variable.resolution,
            value: variable.value,
        });
    }

    for (let model of Fitting.tab_list.tabs)
    {
        serialized.models[model.name] = {
            constant: [...model.constant],
            value: model.expression.source,
            ref: model.ref,
        };
    }

    for (let plot of Plot.tab_list.tabs)
    {
        serialized.plots[plot.name] = {
            axis_1: plot.axis_1,
            axis_2: plot.axis_2,
            dimensions: plot.dimensions,
            functions: plot.functions,
        };
    }

    for (let sheet of Sheet.tab_list.tabs)
    {
        serialized.plots[sheet.name] = {
			// TODO
        };
    }

    return serialized;
}

function deserialize(data)
{
    // Unload current project
    document.querySelector("#settings_list").innerHTML = "";
    document.querySelector("#function_list").innerHTML = "";

    if (Setting.instances)
    {
        for (let name in Setting.instances)
            delete window[name];
        for (let name in Expression.instances)
            delete window[name];
    }

    Setting.instances = {};
    Expression.instances = {};
    Variable.instances = {};
    Fitting.tab_list.clear();
    Plot.tab_list.clear();
    Sheet.tab_list.clear();

    // Update name
    loaded_project = data?.name;
    document.querySelector("#project-name").innerText = loaded_project || "Unnamed Project";

    // Load
    if (data == null)
        return false;

    for (let name in data.settings)
    {
        let src = data.settings[name];
        if (src.type == 'lut') add_lut(name, src.url, src.bilinear);
        else new Setting(name, src.type, src.value, src.settings);
    }

    for (let src of data.expressions)
        new Expression(src);

    for (let variable of data.variables)
        new Variable(variable.name, variable);

    for (let name in data.models)
        new Fitting(data.models[name], name);

    for (let name in data.plots)
        new Plot(data.plots[name], name);

    for (let name in data.sheets)
        new Sheet(data.sheets[name], name);

    // Mark project as last opened
    localStorage.setItem('last-project', data.name);

    return true;
}
