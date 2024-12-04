
register_sample("Wave height", () => {
	
	new Sheet({
        source: `var g = 9.81;

function PeakOmega(fetch, windSpeed) { return 22.0 * pow(abs(windSpeed * fetch*1000 / (g * g)), -0.33) }
function Alpha(fetch, windSpeed) { return 0.076 * pow(windSpeed * windSpeed / (g * fetch*1000), 0.22) }

function WindSpeed(peakOmega, alpha) { return min(32.7, pow(pow(alpha / 0.076, 4.54545) * pow(peakOmega / 22.0, -3.0) * g*g*g, 0.333)) }
function Fetch(peakOmega, alpha) { return min(250.0, WindSpeed(peakOmega, alpha) * WindSpeed(peakOmega, alpha) / (1000 * g * pow(alpha / 0.076, 4.54545))) }

function parse_table(table_str)
{
	let lines = table_str.trim().split("\\n");
	let sample_count_f = lines.length - 1;

	let result = {
		axis_w: [],
		axis_f: [],
		data: [] // index fetch then wind
	};

	result.axis_w.push(0); // Force wind 0 to be at 0

	let speeds = lines[0].split(/\\t+/);
	let sample_count_w = speeds.length - 1;

	for (let wind = 0; wind < sample_count_w; wind++)
		result.axis_w.push(parseFloat(speeds[wind + 1]))

	for (let fetch = 0; fetch < sample_count_f; fetch++)
	{
		let values = lines[fetch + 1].split(/\\t+/);
		result.axis_f.push(parseFloat(values[0]));
		result.data.push([0]);
		for (let wind = 0; wind < sample_count_w; wind++)
		{
			result.data[fetch].push(parseFloat(values[wind + 1]));
		}
	}

	return result;
}

var table = parse_table(\`
x	1
0	0
1	0\`);
`
	}, "water_height");

    function water_height_table(fetch, windSpeed)
    {
		let f = find_lerp(fetch, table.axis_f);
		let w = find_lerp(windSpeed, table.axis_w);

		let low = lerp(table.data[f[0]][w[0]], table.data[f[1]][w[0]], f[2]);
		let high = lerp(table.data[f[0]][w[1]], table.data[f[1]][w[1]], f[2]);

		return lerp(low, high, w[2]);
    }


    Variable.get("fetch", {min: 0.5, max: 250, res: 32});
    Variable.get("windSpeed", {min: 0, max: 32.7, res: 32});
    new Expression(water_height_table);

    new Fitting({
        ref: water_height_table,
        value: "polynom(fetch, -polynom(windSpeed,a,b,0)/(250*250), 2.0*polynom(windSpeed,a,b,0)/250, 0)",
    }, "water_height_fit");

    new Plot({
		axis_1: "fetch",
		axis_2: "windSpeed",
		
        functions: [water_height_table, "water_height_fit"]
    });


	// Plot in terms of peak omega and alpha
    function water_height_table_2(peakOmega, alpha)
    {
		return water_height_table(Fetch(peakOmega, alpha), WindSpeed(peakOmega, alpha));
    }

    Variable.get("peakOmega", {min: PeakOmega(250, 32.7), max: PeakOmega(0.5, 0.001), res: 128});
    Variable.get("alpha", {min: Alpha(250, 0.001), max: Alpha(0.5, 32.7), res: 128});
    new Expression(water_height_table_2);

    /*new Plot({
		axis_1: "peakOmega",
		axis_2: "alpha",

        functions: [water_height_table_2]
    });*/
});
