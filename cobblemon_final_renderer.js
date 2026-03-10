(function() {
    let start_action, stop_action;
    let isRunning = false;
    const PLUGIN_ID = 'cobblemon_final_renderer'; 

    const SETTINGS = {
        root: 'C:/Users/Cedric/Desktop/cobblemon/extra_clean',
        output: 'C:/Users/Cedric/Desktop/cobblemon/final_bedrock'
    };

    Plugin.register(PLUGIN_ID, {
        title: 'Cobblemon Master Renderer',
        author: 'Cedric & Gemini',
        icon: 'photo_camera',
        version: '11.2',
        onload() {
            start_action = new Action('run_final_render', {
                name: '📸 DÉMARRER LE RENDU',
                icon: 'play_arrow',
                click: () => { if (!isRunning) { isRunning = true; startProcess(); } }
            });
            stop_action = new Action('stop_final_render', {
                name: '🛑 STOP',
                icon: 'stop',
                click: () => { isRunning = false; Blockbench.showQuickMessage("Arrêt demandé..."); }
            });
            MenuBar.addAction(start_action, 'tools');
            MenuBar.addAction(stop_action, 'tools');
        },
        onunload() { 
            start_action.delete(); 
            stop_action.delete();
        }
    });

    async function startProcess() {
        const fs = require('fs');
        const path = require('path');

        if (!fs.existsSync(SETTINGS.root)) return Blockbench.showQuickMessage("Dossier source introuvable !");

        const pokeFolders = fs.readdirSync(SETTINGS.root).filter(f => fs.statSync(path.join(SETTINGS.root, f)).isDirectory());

        for (const pokeFolder of pokeFolders) {
            if (!isRunning) break;

            const pokenum = pokeFolder.split('_')[0]; 
            const pokePath = path.join(SETTINGS.root, pokeFolder);
            const modelFolders = fs.readdirSync(pokePath).filter(f => fs.statSync(path.join(pokePath, f)).isDirectory());

            for (const modelFolder of modelFolders) {
                if (!isRunning) break;
                
                const folderPath = path.join(pokePath, modelFolder);
                const geoFile = fs.readdirSync(folderPath).find(f => f.endsWith('.geo.json'));

                if (geoFile) {
                    try {
                        if (typeof Project !== 'undefined' && Project) Project.close();
                        await new Promise(r => setTimeout(r, 200));

                        const baseName = geoFile.replace('.geo.json', '');

                        // 1. CHARGEMENT GÉOMÉTRIE
                        const geoContent = fs.readFileSync(path.join(folderPath, geoFile), 'utf-8');
                        Codecs.bedrock.load(JSON.parse(geoContent), {path: path.join(folderPath, geoFile)});
                        await new Promise(r => setTimeout(r, 400));

                        // 2. CHARGEMENT ANIMATION
                        const animPath = path.join(folderPath, baseName + '.animation.json');
                        if (fs.existsSync(animPath)) {
                            const animContent = fs.readFileSync(animPath, 'utf-8');
                            try { Codecs.bedrock_animation.load(JSON.parse(animContent), {path: animPath}); }
                            catch(e) { Animator.loadFile({path: animPath, content: animContent}); }
                        }

                        // 3. LOGIQUE DE ZOOM (TON CODE)
                        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                        Project.elements.forEach(el => {
                            if (el instanceof Cube && el.mesh) {
                                let box = new THREE.Box3().setFromObject(el.mesh);
                                minX = Math.min(minX, box.min.x); maxX = Math.max(maxX, box.max.x);
                                minY = Math.min(minY, box.min.y); maxY = Math.max(maxY, box.max.y);
                            }
                        });

                        let realW = maxX - minX;
                        let realH = maxY - minY;
                        if (realH <= 0) realH = 16;
                        if (realW <= 0) realW = 16;

                        const pview = Preview.selected || main_preview;
                        if (pview) {
                            pview.setProjectionMode(true);
                            let finalZoom = 1.2 / (Math.max(realW, realH) / 16);
                            pview.camera.zoom = finalZoom;
                            
                            let visibleHeightUnits = 20 / finalZoom; 
                            let targetY = minY + (visibleHeightUnits / 2) - (visibleHeightUnits * 0.05);
                            
                            pview.camera.position.set(-100, targetY, -100);
                            if (pview.controls) pview.controls.target.set(0, targetY, 0);
                            pview.camera.updateProjectionMatrix();
                        }

                        // 4. EXPORTS
                        const finalName = pokenum + "_" + baseName;

                        // --- NORMAL ---
                        const normTex = path.join(folderPath, baseName + '.png');
                        if (fs.existsSync(normTex)) {
                            await applyTexture(normTex);
                            await applyPose();
                            await saveImg(pview, path.join(SETTINGS.output, 'Normal'), finalName);
                        }

                        // --- SHINY ---
                        const shinyTex = path.join(folderPath, baseName + '_shiny.png');
                        if (fs.existsSync(shinyTex)) {
                            await applyTexture(shinyTex);
                            await applyPose();
                            await saveImg(pview, path.join(SETTINGS.output, 'Shiny'), finalName);
                        }

                    } catch (e) { console.error(e); }
                }
            }
        }
        isRunning = false;
        Blockbench.showQuickMessage("TRAITEMENT TERMINÉ", 5000);
    }

    async function applyPose() {
        if (Modes.options.animate) Modes.options.animate.select();
        let anim = Animation.all.find(a => a.name.includes('idle')) || Animation.all[0];
        if (anim) { 
            anim.select(); 
            Timeline.setTime(0.5);
            if (typeof Animator !== 'undefined') Animator.preview();
        }
        await new Promise(r => setTimeout(r, 500)); // Pause pour stabiliser la pose
    }

    async function applyTexture(texPath) {
        if (Texture.all.length > 0) Texture.all.slice().forEach(t => t.remove());
        const tex = new Texture().fromPath(texPath).add();
        await new Promise(r => setTimeout(r, 400));
        Project.elements.forEach(el => { if (el.faces) for (let f in el.faces) el.faces[f].texture = tex.uuid; });
        Canvas.updateAll();
    }

    async function saveImg(pview, dir, name) {
        const fs = require('fs');
        const path = require('path');
        pview.render();
        const out = document.createElement('canvas');
        out.width = 512; out.height = 512;
        out.getContext('2d').drawImage(pview.canvas, 0, 0, 512, 512);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        // Utilisation de Buffer comme dans ton code précédent
        fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(out.toDataURL('image/png').split('base64,')[1], 'base64'));
    }
})();