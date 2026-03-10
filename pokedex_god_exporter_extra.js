(function() {

const fs = require("fs");
const path = require("path");

const EXPORT_DIR = "D:/pokedex_web_export/extra";

// Liste des animations à garder
const KEEP_ANIMS = [
    "ground_idle","battle_idle","water_idle","air_idle",
    "ground_walk","idle_ground","idle_battle","idle_water",
    "idle_air","walk_ground"
];

let taskQueue = [];

Plugin.register("pokedex_god_exporter_extra", {
    title: "Pokedex Final GLB Exporter",
    author: "Auto Pipeline",
    version: "1.0.0",

    onload() {
        new Action("run_final_export", {
            name: "🚀 EXPORT POKEDEX GLB",
            icon: "play_arrow",

            click() {
                Blockbench.import({extensions:["json"]}, (files) => {
                    if (!files.length) return;

                    try {
                        taskQueue = JSON.parse(files[0].content);
                        console.log("🚀 Tâches :", taskQueue.length);

                        if (!fs.existsSync(EXPORT_DIR))
                            fs.mkdirSync(EXPORT_DIR, { recursive: true });

                        processNext();
                    } catch(e) {
                        console.error("JSON invalide", e);
                    }
                });
            }
        });

        MenuBar.addAction("run_final_export","tools");
    },

    onunload() {
        if (Actions.run_final_export) Actions.run_final_export.delete();
    }
});

async function loadImage(file) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = "file://" + file;
    });
}

async function mergeTextures(basePath, layers) {
    const base = await loadImage(basePath);
    if (!base) return null;

    const canvas = document.createElement("canvas");
    canvas.width = base.width;
    canvas.height = base.height;
    const ctx = canvas.getContext("2d");

    ctx.drawImage(base, 0, 0);

    for (const layer of layers) {
        const img = await loadImage(layer);
        if (img) ctx.drawImage(img, 0, 0);
    }

    return canvas;
}

function filterAnimations() {
    if (!Animation.all) return;
    Animation.all.slice().forEach(anim => {
        const name = anim.name.toLowerCase();
        const keep = KEEP_ANIMS.some(k => name.includes(k));
        if (!keep) anim.remove();
    });
}

function applyTexture(canvas) {
    Texture.all.slice().forEach(t => t.remove());

    const tex = new Texture({name:"merged"});
    tex.fromDataURL(canvas.toDataURL());
    tex.add();

    Cube.all.forEach(c => {
        for (let f in c.faces) c.faces[f].texture = tex.id;
    });
}

async function loadModel(file) {
    return new Promise((resolve, reject) => {
        try {
            const raw = fs.readFileSync(file, "utf8");
            Codecs.project.load(JSON.parse(raw), { path: file });
            setTimeout(resolve, 300);
        } catch(e) {
            reject(e);
        }
    });
}

async function exportGLB(output) {
    const finalPath = path.join(EXPORT_DIR, output + ".gltf");
    if (fs.existsSync(finalPath)) {
        console.log("⏩ Skip :", output);
        return;
    }

    Animator.preview();
    Canvas.updateAll();
    await new Promise(r => setTimeout(r, 200));
// Force la pose de l'animation "idle" avant l'export
if (Animation.all.length > 0) {
    let idleAnim = Animation.all.find(a => a.name.includes('idle'));
    if (idleAnim) {
        idleAnim.select();
        Animator.preview(); // Met le modèle en position d'animation
    }
}
    const buffer = await Codecs.gltf.compile({
        binary: true,
        textures: true,
        animations: true,
        all_animations: true,
        single_skeleton: true,
        is_complete: true
    });

    fs.writeFileSync(finalPath, Buffer.from(buffer));
    console.log("✅ Export :", output);
}

async function processNext() {
    if (!taskQueue.length) {
        Blockbench.showQuickMessage("✅ Export terminé");
        console.log("🏁 FIN");
        return;
    }

    const task = taskQueue.shift();
    console.log("📦", task.output);

    try {
        if (window.Project) Project.close(true);

        await loadModel(task.model);
        filterAnimations();

        const canvas = await mergeTextures(task.texture_base, task.layers || []);
        if (canvas) applyTexture(canvas);

        Project.name = task.output;
        await exportGLB(task.output);

    } catch(e) {
        console.error("❌ Erreur :", task.output, e);
    }

    setTimeout(processNext, 150);
}

})();