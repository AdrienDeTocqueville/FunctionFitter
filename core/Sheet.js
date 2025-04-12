class Sheet
{
    static tab_list = new TabList('#sheet_list', Sheet, false, false);

    static code_editor = null;
    static current_tab = null;

    constructor(settings = {}, name)
    {
        this.name = name || "Sheet " + (Sheet.tab_list.tabs.length + 1);
        this.source = (settings.source || "").trim();

        Sheet.tab_list.add_element(this);
		this.rebuild();
    }

    on_display()
    {
		if (Sheet.current_tab)
		{
			if (Sheet.current_tab == this)
				return Sheet.close_editor();

			// Save changes before changing tab
			Sheet.current_tab.rebuild(Sheet.code_editor.getValue());
		}
		else
		{
            document.querySelector("#regular-view").style.display = "none";
            document.querySelector("#sheet-view").style.display = "flex";
        }

        if (Sheet.code_editor == null)
        {
            let div = document.querySelector("#sheet-editor");
            div.style = "height: 100%; width: 100%";
            div.className = "editor";
            div.innerHTML = "func()";

            Sheet.code_editor = ace.edit(div);
            Sheet.code_editor.setTheme("ace/theme/monokai");
            Sheet.code_editor.session.setMode("ace/mode/javascript");
            Sheet.code_editor.renderer.setScrollMargin(4, 0);

            document.querySelector("#sheet-view > button").onclick = Sheet.close_editor;
        }

        // Fill editor with sheet content
		Sheet.current_tab = this;
        Sheet.code_editor.session.setValue(this.source);
    }

    rebuild(new_source)
    {
		if (new_source)
			this.source = new_source;

        // recompile functions
		globalThis.eval(this.source); // whatcha gonna do
    }

    static close_editor()
    {
        if (Sheet.current_tab)
        {
			Sheet.current_tab.rebuild(Sheet.code_editor.getValue());
			Sheet.current_tab = null;

            document.querySelector("#regular-view").style.display = "flex";
            document.querySelector("#sheet-view").style.display = "none";
            Sheet.tab_list.unselect();
            repaint_all();
        }
    }
}
