// C:\Users\adrien.tocqueville\AppData\Local\Programs\Opera\launcher.exe --allow-file-access-from-files

function model_f (x, z,   l, o, s)
{
    z *= s;
    return saturate(l*z / Math.pow(l*l + z*z + o, 2));
    //let num = polynom(z, a, b, c);
    //return saturate(num / (d + Math.pow(l*l + z*z, 2)));
}

function model_2d(x, z,   l, s, d)
{
    let res = l * z / Math.pow(l*l + (z-d)*(z-d)*s, 2);
    return Math.max(res, 0);
}

function ReverseBits32(bits)
{
    bits = (bits << 16) | (bits >>> 16);
    bits = ((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8);
    bits = ((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4);
    bits = ((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2);
    bits = ((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1);
    return bits >>> 0;
}

function VanDerCorputBase2(i)
{
    return ReverseBits32(i) * rcp(4294967296.0); // 2^-32
}

function hammer(i, sequenceLength)
{
    return float2(i / sequenceLength, VanDerCorputBase2(i));
}

function SampleRectangle(
    /*real2     */   u,
    /*real4x4   */   localToWorld,
    /*real      */   width,
    /*real      */   height,
    /*out real  */   lightPdf,
    /*out real3 */   P,
    /*out real3 */   Ns)
{
    // Random point at rectangle surface
    P = float3((u.x - 0.5) * width, (u.y - 0.5) * height, 0);
    Ns = float3(0, 0, -1); // Light down (-Z)

    // Transform to world space
    return {
        P: add(float3(dot(P, localToWorld[0]), dot(P, localToWorld[1]), -dot(P, localToWorld[2])), localToWorld[3]),
        Ns: float3(dot(Ns, localToWorld[0]), dot(Ns, localToWorld[1]), -dot(Ns, localToWorld[2])),

        // pdf is inverse of area
        lightPdf: 1.0 / (width * height),
    };
}

function area_light(x, z)
{
    let lightHeight = LIGHT_HEIGHT;
    let lightWidth  = LIGHT_WIDTH;
    let lightPosition   = float3(0, 1, 0);
    let lightRight      = float3(1, 0, 0);
    let lightUp         = float3(0, 1, 0);
    let lightForward    = float3(0, 0, 1);
    let localToWorld = [lightRight, lightUp, lightForward, lightPosition];

    let positionWS = float3(x, 0, z);

    let sampleCount = 512;
    let diffuseLighting = 0;
    let normalWS = float3(0, 1, 0);

    let rng = Math.random;

    for (let i = 0; i < sampleCount; ++i)
    {
        let u = hammer(i, sampleCount);

        let {P, Ns, lightPdf} = SampleRectangle(u, localToWorld, lightWidth, lightHeight);

        // Get distance
        let unL = sub(P, positionWS);
        let sqrDist = dot(unL, unL);
        let L = normalize(unL);

        // Cosine of the angle between the light direction and the normal of the light's surface.
        let cosLNs = saturate(-dot(L, Ns));

        // We calculate area reference light with the area integral rather than the solid angle one.
        let NdotL = saturate(dot(normalWS, L));
        let illuminance = cosLNs / (sqrDist * lightPdf);

        diffuseLighting += NdotL * illuminance;
    }

    let INV_PI = 0.31830988618379067154;
    return diffuseLighting * INV_PI / DIFFUSE_SCALE;
}

add_setting("DIFFUSE_SCALE", "number", 100);
add_setting("LIGHT_HEIGHT", "number", 1);
add_setting("LIGHT_WIDTH", "number", 2);
add_setting("L", "range", 0.2, {min: 0, max: 1.5, step: 0.05});
add_setting("O", "range", 0.0, {min: 0, max: 3, step: 0.05});
add_setting("S", "range", 1, {min: 0, max: 3, step: 0.05});

new Expression(area_light);
new Expression(model_2d);
new Expression(model_f);

new Fitting(area_light);

new Plot([area_light, "model_1"], {
    axis_1: 'z',
    values: {
        x: {min: 0, max: 4, res: 16},
        z: {min: 0, max: 4, res: 32},
        l: "0.6 * t", s: "0.4 * l", d: "-0.3 * s",
    }
});


//$settings.parameters[0].range = [0, 5];
//$settings.parameters[1].range = [-1, 4];
//rebuild_ranges();
