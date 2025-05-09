register_sample("FGD", () => {

    function model_f(NdotV, p1, p2)
    {
        return polynom(NdotV - 0.74, 0, p1, 0, p2);
    }
    function fgd_ref(NdotV, roughness)
    {
        if (TRANSFORM_FGD)
        {
            if (FGD_LAYER == 0)
            {
                if (roughness < 0.02 && NdotV <= 0.6)
                    return fgd_lazarov(NdotV, roughness);
                if (NdotV > 0.6)
                    return 2*fgd_ref(0.6, roughness) - fgd_ref(0.6-(NdotV-0.6), roughness);
            }
            if (FGD_LAYER == 1 && roughness < 0.4 && NdotV < 0.07)
                return 1;
        }
        return FGD_LUT(Math.sqrt(NdotV), 1 - roughness, FGD_LAYER);
    }
    function fgd_lazarov(NdotV, roughness)
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
    }

    async function main()
    {
        new Setting("FGD_LUT", "lut", "samples/FGD_64.png", {bilinear: true});
        new Setting("TRANSFORM_FGD", "checkbox", true);
        new Setting("FGD_LAYER", "number", 0 , {values: ["F", "G", "D"], dropdown: false});

        new Expression(fgd_ref);
        new Expression(fgd_lazarov);
        new Expression(model_f);

        new Fitting({
            ref: fgd_ref,
            value: "model_f(NdotV, polynom(roughness, a0, b0, c0), polynom(roughness, a1, b1, c1))",
        }, "fgd_fit");

        new Plot({
            axis_1: "NdotV",
            axis_2: "roughness",

            functions: [fgd_ref, fgd_lazarov],
        });
    }
    main()
});
