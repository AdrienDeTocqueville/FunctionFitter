function parse_table(txt)
{
	try {
		let data;
		eval('data = ' + txt);

		if (Array.isArray(data))
		{
			if (typeof data[0] === "number")
			{
			}
		}
		else if (typeof data === "object")
			return data;

	} catch(error) {
		console.log(error);
	}

	return undefined;
}

/*
function parse_table(table_str)
{
	let lines = table_str.trim().split("\n");
	let sample_count_f = lines.length - 1;

	let result = {
		axis_w: [],
		axis_f: [],
		data: [] // index fetch then wind
	};

	result.axis_w.push(0); // Force wind 0 to be at 0

	let speeds = lines[0].split(/\t+/);
	let sample_count_w = speeds.length - 1;

	for (let wind = 0; wind < sample_count_w; wind++)
		result.axis_w.push(parseFloat(speeds[wind + 1]))

	for (let fetch = 0; fetch < sample_count_f; fetch++)
	{
		let values = lines[fetch + 1].split(/\t+/);
		result.axis_f.push(parseFloat(values[0]));
		result.data.push([0]);
		for (let wind = 0; wind < sample_count_w; wind++)
		{
			result.data[fetch].push(parseFloat(values[wind + 1]));
		}
	}

	return result;
}
*/
