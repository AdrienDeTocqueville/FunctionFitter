// C:\Users\adrien.tocqueville\AppData\Local\Programs\Opera>launcher.exe --allow-file-access-from-files
var fgd_ref = `function fgd_ref(NdotV, roughness)
{
    //if (TRANSFORM_FGD)
    //{
    //    if (FGD_LAYER == 0)
    //    {
    //        if (roughness < 0.02 && NdotV <= 0.6)
    //            return FGD_LAZAROV(NdotV, roughness);
    //        if (NdotV > 0.6)
    //            return 2*FGD_LuT(0.6, roughness) - FGD_LUT(0.6-(NdotV-0.6), roughness);
    //    }
    //    if (FGD_LAYER == 1 && roughness < 0.4 && NdotV < 0.07)
    //        return 1;
    //}
    return sample_lut("FGD", Math.sqrt(NdotV), 1 - roughness, FGD_LAYER);
}`;
var fgd_lazarov = `function fgd_lazarov(NdotV, roughness)
{
    let x = (1-roughness)*(1-roughness);
    let y = NdotV;

    let b1 = -0.1688;
    let b2 = 1.895;
    let b3 = 0.9903;
    let b4 = -4.853;
    let b5 = 8.404;
    let b6 = -5.069;
    let bias = saturate( Math.min( b1 * x + b2 * x * x, b3 + b4 * y + b5 * y * y + b6 * y * y * y ) );

    let d0 = 0.6045;
    let d1 = 1.699;
    let d2 = -0.5228;
    let d3 = -3.603;
    let d4 = 1.404;
    let d5 = 0.1939;
    let d6 = 2.661;
    let delta = saturate( d0 + d1 * x + d2 * y + d3 * x * x + d4 * x * y + d5 * y * y + d6 * x * x * x );
    return [bias, delta, 1][FGD_LAYER];
}`;

function polynom(x, a, b, c = 0, d = 0)
{
    return a + b * x + c * x * x + d * x * x * x
}

function saturate(x)
{
    return Math.max(0, Math.min(x, 1));
}

function lerp(a, t, b)
{
    return (1 - t) * a + t * b;
}

function truncate(x)
{
    return round(100*x)/100
}

async function main()
{
    await add_lut("FGD_64.png", "FGD");
    add_variable("TRANSFORM_FGD", "checkbox", false);
    add_variable("FGD_LAYER", "number", 1);
    add_function(fgd_ref, true);
    add_function(fgd_lazarov, false);
}
main()
