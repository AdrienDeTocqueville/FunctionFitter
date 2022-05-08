class Expression
{
    static instances = {};

    constructor(source, name)
    {
        this.name = name;
        this.is_function = (name == undefined);
        this.set_source(source);
        if (this.is_function)
            this.create_editor();

        if (source == undefined)
            on_settings();

        Expression.instances[this.name] = this;
    }

    set_source(source)
    {
        if (this.is_function)
        {
            try {
                if (source instanceof Function) source = source.toString();
                this.function = eval("(" + source + ")");

                this.source = source;
                this.parse_parameters();

                if (this.name != this.function.name && window[this.name] != undefined)
                    delete window[this.name];
                this.name = this.function.name;
                window[this.name] = this.function;

                // this.repaint()
            } catch (error) {
                console.error(error);
                return false;
            }
        }
        else
        {
            let [number, dependencies] = Variable.eval_with_proxy(source);
            if (dependencies == null) return false;

            this.source = source;
            this.parameters = dependencies;
        }
        return true;
    }

    parse_parameters()
    {
        let STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
        let FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
        let FN_ARG_SPLIT = /,/;
        let fnText = this.source.replace(STRIP_COMMENTS, '');
        let argDecl = fnText.match(FN_ARGS);
        let parameters = argDecl[1].split(FN_ARG_SPLIT);
        for (let i = 0; i < parameters.length; i++)
            parameters[i] = parameters[i].trim();
        this.parameters = parameters;
    }

    create_editor()
    {
        let line_count = Math.min(15, this.source.split(/\r\n|\r|\n/).length - 1);

        let div = document.createElement("div");
        div.id = this.name + "-editor";
        div.style = `margin-top: 5px; height: ${line_count*17 + 8}px`;
        div.className = "editor";
        div.innerHTML = this.source;
        add_list_element('#function_list', "", [div]);

        let editor = ace.edit(div);
        editor.setTheme("ace/theme/monokai");
        editor.session.setMode("ace/mode/javascript");
        editor.renderer.setScrollMargin(4, 0);

        let refresher, self = this;
        editor.session.on('change', function(delta) {
            clearTimeout(refresher);
            refresher = setTimeout(function() {
                for (let annotation of editor.getSession().getAnnotations())
                    if (annotation.type == "error") return;
                self.set_source(editor.getValue());
            }, 500);
        });
    }

    static sort_by_dependency(variables)
    {
        let definitions = [], defined = new Set(), has_change;
        do {
            has_change = false;
            for (const name of variables)
            {
                let variable = Variable.get(name);
                if (variable.dependencies.some(v => !defined.has(v))) continue;

                definitions.push(variable);
                defined.add(name);
                has_change = true;

                variables.delete(name);
            }
        } while (has_change);
        return definitions;
    }

    compile(axis_1, axis_2)
    {
        let inputs = [], dependencies = new Set();
        let track_dependencies = (variable) => {
            if (dependencies.has(variable))
                return;
            dependencies.add(variable);
            for (let d of Variable.get(variable).dependencies)
                track_dependencies(d);
        }

        for (let i = 0; i < this.parameters.length; i++)
        {
            let param = this.parameters[i];
            if (param == axis_1.name || param == axis_2?.name)
                inputs.push(param);
            else
                track_dependencies(param);
        }

        let definitions = "";
        if (dependencies.size != 0)
        {
            let sorted = Expression.sort_by_dependency(dependencies);
            definitions = `let ${sorted.map(v => v.name + "=" + v.value).join(',')};`;
        }

        let body = !this.is_function ? `${definitions} return ${this.source}` :
            `${definitions} return ${this.name}(${this.parameters.join(',')})`
        return new Function(...inputs, body);
    }
}

/*
let default_func = `function new_function(x, y)
{
    return x + y;
}`;

document.querySelector("#add_function").onclick = () => {
    add_reference(default_func, false);
}
*/
