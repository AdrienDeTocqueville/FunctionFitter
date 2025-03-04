Split(["#settings", "#plots", "#fitting"], {sizes: [33, 33, 33]});

/// LISTS

function add_list_element(list, style, children, on_delete)
{
    let li = document.createElement("li");
    li.className = "deletable-list list-group-item";
    li.style = style;

    for (let child of children)
    {
        if (child)
            li.appendChild(child);
    }

    if (on_delete != null)
    {
        let delete_button = document.createElement("span");
        delete_button.className = "close";
        delete_button.innerHTML = "&times;";
        delete_button.onclick = () => on_delete(li);

        li.appendChild(delete_button);
    }

    if (typeof list === 'string' || list instanceof String)
        list = document.querySelector(list);

    list.appendChild(li);
}

let Modal = {
    open: (title, content, on_close) => {
        let modal = document.createElement("div");
        modal.id = "modal";
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <h5 style="margin-top: 20px; margin-bottom: 20px">${title}</h5>
            </div>`;

        modal.onclick = (event) => { if (event.target == modal) Modal.close(); }
        modal.querySelector(".close").onclick = Modal.close;

        document.body.appendChild(modal);
        let h5 = modal.querySelector("h5");
        h5.parentNode.insertBefore(content, h5.nextSibling);

        Modal.on_close = on_close;
    },
    close: () => { Modal.on_close?.(); Modal.on_close = null; document.querySelector("#modal")?.remove(); }
};

class TabList
{
    // Requirements on elem_type:
    // required: func on_display, prop name
    // optional: func on_settings
    constructor(id, elem_type, has_settings = false, has_content = true)
    {
        this.tabs = [];
        this.element = document.querySelector(id);

        this.ul = document.createElement("ul");
        this.ul.className = "nav nav-tabs";

        let li = document.createElement("li");
        li.className = "nav-item nav-link active";
        li.innerText = "+";
        li.$element = null;
        li.onclick = () => { let x = new elem_type(); if (!this.content) this.ul.children[this.ul.childElementCount-2].onclick(); if (has_settings) x.on_settings(); }

        this.ul.appendChild(li);
        this.element.appendChild(this.ul);

        if (has_content)
        {
            this.active_tab = li;

            this.content = document.createElement("div");
            this.content.style = "border: 1px solid #ddd; padding: 15px;"
            this.element.appendChild(this.content);
        }

        if (has_settings)
        {
            let settings = document.createElement("i");
            settings.className = "fa-solid fa-ellipsis-vertical";
            settings.onclick = () => {
                if (this.active_tab.$element == null) return;
                this.active_tab.$element.on_settings();
            }

            settings.style = "position: absolute; top: 12px; right: -5px; width: 20px; text-align: center; display: none";
            this.ul.style = "max-width: calc(100% - 15px)";
            this.element.style = "position: relative";
            this.element.appendChild(settings);
            this.settings = settings;
        }
    }

    get_active_element() { return this.active_tab ? this.active_tab.$element : null; }
    repaint() { if (this.content) this.content.innerHTML = ""; this.get_active_element()?.on_display(this.content); }
    unselect() { this.active_tab?.classList.remove("active"); this.active_tab = null; }

    add_element(elem)
    {
        let li = document.createElement("li");
        li.$element = elem;
        li.className = "nav-item nav-link"
        li.innerText = elem.name;
        li.onclick = () => {
            this.active_tab?.classList.remove("active");
            this.active_tab = li;
            this.active_tab.classList.add("active");
            this.repaint();
        }

        this.ul.insertBefore(li, this.ul.children[this.ul.childElementCount-1]);

        if (this.settings)
            this.settings.style.display = "block";

        this.tabs.push(elem);
        if (this.content)
            li.onclick();
    }

    remove(elem)
    {
        let li = undefined;
        for (let i of this.ul.childNodes)
        {
            if (elem == i.$element)
            {
                li = i;
                break;
            }
        }

        let idx = undefined;
        for (let i = 0; i < this.tabs.length; i++)
        {
            if (elem == this.tabs[i])
            {
                idx = i;
                break;
            }
        }

        if (li != undefined && idx != undefined)
        {
            if (this.active_tab == li)
            {
                this.active_tab = li.previousSibling || li.nextSibling;
                if (this.active_tab)
                {
                    if (this.active_tab.$element == null)
                        this.active_tab = null;
                    else
                        this.active_tab.classList.add("active");
                }
            }
            this.tabs.splice(idx, 1);
            li.remove();
            this.repaint();
        }

        if (this.settings && this.tabs.length == 0)
            this.settings.style.display = "none";
    }

    clear()
    {
        this.ul.replaceChildren(this.ul.children[this.ul.childElementCount-1]);
        this.active_tab = this.ul.children[0];
        this.active_tab.classList.add("active");

        this.tabs = [];
        if (this.content)
            this.content.innerHTML = "";

        if (this.settings)
            this.settings.style.display = "none";
    }
}

class Table
{
    constructor(headers, settings)
    {
        settings = settings|| {};

        let table = document.createElement("table");
        table.className = "table table-bordered";
        table.innerHTML = "<thead> <tr></tr> </thead> <tbody></tbody>";

        let row = table.querySelector("tr");
        for (let title of headers)
        {
            let elem = document.createElement("th");
            elem.scope = "col";
            elem.innerText = title;
            if (settings[title] != undefined)
                elem.colSpan = settings[title].colSpan;

            row.appendChild(elem);
        }

        row.children[0].style = "width: 1% !important; white-space: nowrap !important;";
        this.element = table;
    }

    add_row(elements)
    {
        let body = this.element.querySelector("tbody");
        let row = document.createElement("tr");
        for (let i = 0; i < elements.length; i++)
        {
            let elem = document.createElement(i == 0 ? "th" : "td");
            if (i == 0) elem.scope = "row";
            if (typeof elements[i] === "string")
                elem.innerText = elements[i];
            else
                elem.appendChild(elements[i]);
            row.appendChild(elem);
        }
        body.appendChild(row);
    }
}

/// LUTS

function load_lut_async(url, name, canvas)
{
    return new Promise((resolve, reject) => {
        let img = new Image();
        img.setAttribute('crossOrigin', '');
        img.onload = () => {
            let context = canvas.getContext('2d');

            context.setTransform(1, 0, 0, 1, 0, 0);
            context.scale(canvas.width / img.width, canvas.height / img.height);

            context.clearRect(0, 0, img.width, img.height);
            context.drawImage(img, 0, 0);
            Setting.instances[name].image = context.getImageData(0, 0, img.width, img.height);

            Plot.repaint();
            resolve(Setting.instances[name]);
        };
        img.onerror = reject;
        img.src = url;
    });
}

function add_lut(name, url, bilinear = true)
{
    if (name == null)
        name = url.replace(/\.[^/.]+$/, "");

    let canvas = document.createElement("canvas");
    canvas.className = "lut-canvas";
    canvas.style = "margin-right: 20px";
    canvas.width = canvas.height = 64;
    canvas.onclick = async () => {
        const pickerOpts = {
            types: [{
                description: 'Images',
                accept: { 'image/*': ['.png', '.gif', '.jpeg', '.jpg'] }
            }],
            excludeAcceptAllOption: true,
            multiple: false
        };
        [fileHandle] = await window.showOpenFilePicker(pickerOpts);
        let file = await fileHandle.getFile();
        let fr = new FileReader();
        fr.readAsDataURL(file);
        fr.onloadend = function() {
            load_lut_async(fr.result, name, canvas);
        }
    }

    let lut_sampler = new Function('x', 'y', 'channel', `return sample_lut('${name}', x, y, channel)`);
    add_setting(name, "lut", lut_sampler, { bilinear, canvas, url });

    return url != null ? load_lut_async(url, name, canvas) : null;
}

function sample_lut(name, x, y, channel)
{
    let lut = Setting.instances[name], data = lut.image;
    if (data == null) return 0;

    x = saturate(x) * (data.width - 1);
    y = saturate(y) * (data.height - 1);

    function load_lut(x, y)
    {
        coord = (x + y * data.width) * 4;
        return data.data[coord + channel] / 255;
    }

    if (!lut.settings.bilinear)
        return load_lut(Math.round(x), Math.round(y));

    let x_low = Math.floor(x);
    let y_low = Math.floor(y);
    let x_lerp = (x - x_low);

    let low = load_lut(x_low, y_low);
    if (x != x_low)
        low = lerp(low, load_lut(x_low+1, y_low), x_lerp);

    let high = low;
    if (y != y_low)
    {
        high = load_lut(x_low, y_low+1);
        if (x != x_low)
            high = lerp(high, load_lut(x_low+1, y_low+1), x_lerp);
    }

    return lerp(low, high, y - y_low);
}

/// Project Drawer

function refresh_project_list()
{
    document.querySelector("#project_list").innerHTML = "";
    for (let name in $projects)
    {
        let div = document.createElement("div");
        div.innerText = name;
        div.onclick = () => {
            deserialize($projects[name]);
            set_project_drawer(false);
        };
        add_list_element('#project_list', "", [div], () => {
            delete_project(name);
        });
    }
}

function register_sample(name, callback)
{
    let div = document.createElement("div");
    div.innerText = name;
    div.onclick = () => {
        deserialize(); // unload everything: TODO: add save warning
        callback();
        set_project_drawer(false);
    };

    add_list_element('#sample_list', "", [div]);
}

function open_sample(name)
{
    for (let sample of document.querySelector("#sample_list").children)
    {
        if (sample.children[0].innerText == name)
        {
            sample.children[0].onclick();
        }
    }
}

function set_project_drawer(open)
{
    current = this.drawer_opened || false;
    if ((arguments.length == 0 ? !current : open))
    {
        this.drawer_opened = true;
        document.querySelector("#drawer").setAttribute('project-drawer', 'opened');
        document.querySelector("main").setAttribute('project-drawer', 'opened');
    }
    else
    {
        this.drawer_opened = false;
        document.querySelector("#drawer").removeAttribute('project-drawer');
        document.querySelector("main").removeAttribute('project-drawer');
    }
}

document.querySelector("header .fa-bars").onclick = () => set_project_drawer();
document.querySelector("#new-project").onclick = () => { deserialize(); set_project_drawer(false); }

/// Misc.

function repaint_all()
{
    Plot.tab_list.repaint();
    Fitting.tab_list.repaint();
}

function set_theme(theme)
{
    let current = document.body.getAttribute('data-theme')
    theme = theme || (current == 'light' ? 'dark' : 'light');
    localStorage.setItem('theme', theme);
    document.body.setAttribute('data-theme', theme);
}

function create_editor(content, on_change)
{
    let div = document.createElement("div");
    div.className = "line-editor";
    div.innerText = content;

    let editor = ace.edit(div);
    editor.setOptions({
        maxLines: 1,
        autoScrollEditorIntoView: true,
        highlightActiveLine: false,
        printMargin: false,
        showGutter: false,
        mode: "ace/mode/javascript",
        //theme: "ace/theme/monokai"
    });
    // remove newlines in pasted text
    editor.on("paste", function(e) {
        e.text = e.text.replace(/[\r\n]+/g, " ");
    });
    // make mouse position clipping nicer
    editor.renderer.screenToTextCoordinates = function(x, y) {
        let pos = this.pixelToScreenCoordinates(x, y);
        return this.session.screenToDocumentPosition(
            Math.min(this.session.getScreenLength() - 1, Math.max(pos.row, 0)),
            Math.max(pos.column, 0)
        );
    };

    // Enter and Shift-Enter keys
    let validate = () => {
        let res = on_change(editor.getValue());
        if (res === false) return set_color(undefined, true);
        if (res === true) return repaint_all();
        console.log("Invalid return value");
    }
    editor.commands.bindKey("Enter|Shift-Enter", validate);

    // edit style when focused
    let cursor = editor.renderer.$cursorLayer.element;
    cursor.style.display = "none";

    let set_color = (color, is_error) => {
        let shadows = {active: "13 110 253 / 25%", default: "0 0 0 / 0%", error: "255 0 0 / 25%"};
        let outlines = {active: "#86b7fe", default: "#ced4da", error: "red"};

        if (is_error != undefined) set_color.error = is_error;
        if (color != undefined) set_color.color = color;
        let shadowColors = set_color.error ? {active: shadows.error, default: shadows.default} : shadows;
        div.style.boxShadow = `0 0 0 0.25rem rgb(${shadowColors[set_color.color]})`;
        div.style.outlineColor = outlines[set_color.error ? "error" : set_color.color];
    }
    set_color("default");

    editor.on("focus", () => { cursor.style.display = "unset"; set_color("active"); });
    editor.on("blur", validate);

    // On change
    let refresher;
    editor.session.on('change', function(delta) {
        clearTimeout(refresher);
        refresher = setTimeout(function() {
            for (let annotation of editor.getSession().getAnnotations())
                if (annotation.type == "error") return set_color(undefined, true);
            set_color(undefined, false);
        }, 200);
    });

    return div;
}

// type: [lut, dropdown, checkbox, number, range, text, button]
function create_input(type, value, settings, onChange)
{
    if (type == "lut")
    {
        let label = document.createElement("label");
        label.htmlFor = settings.canvas.id;
        label.innerText = settings.label;

        let [box, box_label] = create_input("checkbox", settings.bilinear, {label: "Bilinear Filtering", id: "bilinear-" + name}, () => {
            settings.bilinear = box.checked;
            Plot.repaint();
        });

        let div = document.createElement("div");
        div.style = "padding-top: 9px";
        div.appendChild(box);
        div.appendChild(box_label);

        let input = document.createElement("div");
        input.appendChild(label);
        input.appendChild(div);

        return [input, settings.canvas];
    }


    let input, valid_html_for = false;
    if (type == "dropdown")
    {
        input = document.createElement("div");
        input.className = "btn-group";

        let button = document.createElement("button");
        button.className = "btn btn-sm btn-secondary dropdown-toggle";
        button.type = "button";
        button.disabled = settings.disabled == true;

        let multiselect = Array.isArray(value);
        let update_label = () => {
            if (!multiselect) return button.innerText = value;
            let label = "";
            for (let val of value)
                label += (label != "" ? ", " : "") + val;
            button.innerText = label;
        }
        update_label();

        let active_idx = !multiselect ? settings.values.indexOf(value) : null;
        let ul = document.createElement("ul");
        ul.className = "dropdown-menu";
        for (let i = 0; i < settings.values.length; i++)
        {
            let value_i = settings.values[i];
            let disabled = settings.disabled_values && settings.disabled_values.includes(value_i);
            let li = document.createElement("li");
            li.className = "dropdown-item" + (disabled ? " disabled" : "");
            if (!multiselect)
            {
                li.innerText = value_i;
                if (i == active_idx) li.classList.add("active");
                li.onclick = () => {
                    if (ul.children[active_idx]) ul.children[active_idx].classList.remove('active');
                    value = value_i;
                    ul.children[i].classList.add('active');
                    update_label();
                    if (onChange) onChange(value);
                }
            }
            else
            {
                let [box, label] = create_input("checkbox", value.includes(value_i), {label: value_i});
                li.appendChild(box);
                li.appendChild(label);
                li.onclick = (e) => {
                    if (value.includes(value_i))
                    {
                        box.checked = false;
                        value = value.filter(x => x != value_i);
                    }
                    else
                    {
                        box.checked = true;
                        value.push(value_i);
                        value.sort();
                    }
                    update_label();
                    e.stopPropagation();

                    if (onChange) onChange(value);
                }
            }
            ul.appendChild(li);
        }

        input.appendChild(button);
        input.appendChild(ul);
    }
    else if (type == "button")
    {
        input = document.createElement("button");
        input.className = "btn btn-secondary";
        input.style = "margin-left: 8px";
        input.innerText = settings.innerText;
        input.onclick = onChange;
    }
    else if (Array.isArray(settings.values))
    {
        if (settings.dropdown == true)
        {
            input = document.createElement("select");
            input.className = "form-select form-select-sm";
            let html = "";
            for (let j = 0; j < settings.values.length; j++)
                html += `<option value='${j}' ${j==value?"selected":""}>${settings.values[j]}</option>`;
            input.innerHTML = html;
            if (onChange) input.onchange = () => onChange(parseInt(input.value));
        }
        else
        {
            input = document.createElement("ul");
            input.classList.add('nav', 'nav-pills', 'nav-fill');

            let html = "";
            for (let j = 0; j < settings.values.length; j++)
                html += `<li class='nav-item nav-link ${j==value?"active":""}' style="height: 31px; padding: 0.25rem 0.5rem; font-size: .875rem; cursor: pointer">${settings.values[j]}</li>`;
            input.innerHTML = html;
            for (let j = 0; j < settings.values.length; j++)
            {
                input.children[j].onclick = () => {
                    input.children[value].classList.remove('active');
                    input.children[j].classList.add('active');
                    value = j;
                    if (onChange) onChange(value);
                }
            }
        }
    }
    else
    {
        let classes = {
            checkbox: "form-check-input",
            number: "form-control",
            range: "form-range",
            text: "form-control",
        };

        valid_html_for = true;
        input = document.createElement("input");
        input.className = classes[type];
        input.type = type;
    }

    if (settings.id == undefined && settings.label != undefined)
        settings.id = "input-" + settings.label;

    input.id = settings.id;
    input.step = settings.step;
    let width = settings.width || "100%";

    if (type == 'range')
    {
        input.min = settings.min || 0;
        input.max = settings.max || 1;
        if (settings.step == undefined)
            input.step = (input.max - input.min) / 256;
        input.value = value;

        let label = document.createElement("label");
        label.style = "width: 50px";
        label.innerText = truncate(value, 3);
        label.htmlFor = settings.id;

        let rangeInput = input;
        input.onchange = null;
        input.oninput = () => {
            label.innerText = truncate(rangeInput.valueAsNumber, 3);
            if (onChange) onChange(rangeInput.valueAsNumber);
        };

        let div = document.createElement("div");
        div.style = `width: ${width}; display: flex; flex-direction: row`;
        div.appendChild(label);
        div.appendChild(input);
        input = div;
    }
    else
    {
        let style = (type == 'checkbox') ? "margin-right: 5px;" :
            `width: ${width}; padding: 0 8px;`;
        if (settings.style != undefined)
            style += settings.style;
        input.style = style;

        if (!Array.isArray(settings.values))
        {
            let props = {
                checkbox: "checked",
                number: "valueAsNumber",
                text: "value",
            };
            input[props[type]] = value;
            if (onChange)
                input.onchange = () => onChange(input[props[type]]);
            if (type == "text" && settings.callback)
            {
                input.onkeypress = () => setTimeout(function() {
                    settings.callback(input[props[type]])
                }, 500);
            }
        }
    }

    if (settings.label == undefined)
        return input;

    let label = document.createElement("label");
    label.innerHTML = settings.label;
    label.style = "white-space: nowrap; padding: 2px; padding-right: 6px";
    if (valid_html_for) label.htmlFor = settings.id;

    return [input, label];
}

function wrap(...elements)
{
    let div = document.createElement("div");
    div.className = "single-line";
    for (let elem of elements)
        div.appendChild(elem);
    return div;
}
