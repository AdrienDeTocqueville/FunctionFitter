print = console.log;

document.querySelector("#save").onclick = () => {
    document.cookie = JSON.stringify(serialize());
}

function serialize()
{
    let serialized = {
        theme: $settings.theme,
        graph_dimensions: $settings.graph_dimensions,
        settings: $settings.settings,
        models: [],
        references: [],
        LUTs: {},
        sliders: {},
        variables: {},
    };

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
    $settings = {
        graph_dimensions: data.graph_dimensions,

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

    set_theme(data.theme);
}
