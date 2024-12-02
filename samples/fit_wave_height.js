
register_sample("Wave height", () => {
	
	new Sheet({
        source: `var g = 9.81;

function PeakOmega(fetch, windSpeed) { return 22.0 * pow(abs(windSpeed * fetch*1000 / (g * g)), -0.33) }
function Alpha(fetch, windSpeed) { return 0.076 * pow(windSpeed * windSpeed / (g * fetch*1000), 0.22) }

function WindSpeed(peakOmega, alpha) { return min(32.7, pow(pow(alpha / 0.076, 4.54545) * pow(peakOmega / 22.0, -3.0) * g*g*g, 0.333)) }
function Fetch(peakOmega, alpha) { return min(250.0, WindSpeed(peakOmega, alpha) * WindSpeed(peakOmega, alpha) / (1000 * g * pow(alpha / 0.076, 4.54545))) }

var table = (() => {
	let table_str = \`x	0.001000	3.634222	7.267445	10.900667	14.533890	18.167112	21.800335	25.433556	29.066778	32.700001
0.500000	0.000000	0.172189	0.349069	0.502313	0.591989	0.685910	0.790743	0.876951	1.110142	1.076240
28.222223	0.000219	1.729689	3.117172	4.289617	5.568840	6.842489	7.517123	7.769580	8.713974	10.185813
55.944447	0.000921	2.454033	4.366206	5.713319	7.005017	8.196212	10.572537	11.603674	13.054770	14.761792
83.666672	0.001308	3.117125	4.856600	6.958553	8.878926	10.098042	11.017612	12.129695	14.762961	16.196167
111.388893	0.001714	3.459834	5.745524	7.601034	9.358914	11.492421	12.777795	15.239424	17.194862	19.639803
139.111115	0.001764	3.324723	6.164509	8.666711	9.865814	13.719121	15.663674	17.064583	19.782461	21.893198
166.833344	0.002014	4.163740	6.634459	8.956992	11.008577	14.281808	17.740055	20.627918	22.348070	23.988289
194.555557	0.002345	4.541253	7.452064	11.590300	15.218862	16.677652	17.272060	19.654284	22.630735	27.205545
222.277786	0.002503	4.834609	8.117563	10.493383	13.833505	16.880219	18.714115	20.068998	24.091259	26.402630
250.000015	0.002436	4.852196	9.659721	12.062520	14.511833	17.701851	19.803167	22.160175	25.340780	29.412657\`;

	let lines = table_str.split("\\n");
	let sample_count = 10;

	let result = {
		axis_w: [],
		axis_f: [],
		data: [] // index fetch then wind
	};

	result.axis_w.push(0); // Force wind 0 to be at 0

	let speeds = lines[0].split("\\t");
	for (let wind = 0; wind < sample_count; wind++)
		result.axis_w.push(parseFloat(speeds[wind + 1]))

	for (let fetch = 0; fetch < sample_count; fetch++)
	{
		let values = lines[fetch + 1].split("\\t");
		result.axis_f.push(parseFloat(values[0]));
		result.data.push([0]);
		for (let wind = 0; wind < sample_count; wind++)
		{
			result.data[fetch].push(parseFloat(values[wind + 1]));
		}
	}

	return result;
})();
`
	}, "water_height");

	Sheet.close_editor();

    function water_height_table(fetch, windSpeed)
    {
		function find_uv(value, axis) {
			let i0 = axis.length-1;
			for (let i = 0; i < axis.length; i++)
			{
				if (axis[i] > value)
				{
					i0 = max(0, i - 1);
					break;
				}
			}
			let i1 = min(i0 + 1, axis.length - 1);

			let v0 = axis[i0], v1 = axis[i1];
			let t = saturate((value - v0) / (v1 - v0));

			return [i0, i1, t];
		}

		let f = find_uv(fetch, table.axis_f);
		let w = find_uv(windSpeed, table.axis_w);

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
