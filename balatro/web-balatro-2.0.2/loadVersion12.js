/**
 * 
 * @param {IDBRequest} idbRequest - A request to unwrap
 * @returns {Promise<any>} - The output of the IDBRequest
 */
function unwrapIDBRequest(idbRequest) {
    return new Promise((res, rej) => {
        idbRequest.onsuccess = function(event) {
            res(event.result)
        }
        idbRequest.onerror = function() {
            rej()
        }
    })
}

/** @type {string} - The IndexedDB ID of the currently loaded game */
let loaded_game_id = null;

/**
 * 
 * @param {string} versionId - The IndexedDB ID of the version to load
 */
async function loadVersion(versionId) {
    const progress_bar = $("progressBar")
    const status_text = $("status")

    const loaded_version_name = $("loadedName")

    const run_button = $("runBtn")
    const download_cache_button = $("downloadCachedBtn")
    const make_portable_button = $("makePortableBtn")

    const save_download = $("save-download")
    const save_upload = $("save-upload")
    const save_delete = $("save-delete")

    if (!versionId) {
        loaded_version_name.innerText = "Nothing loaded"

        run_button.disabled = true;
        download_cache_button.disabled = true;
        make_portable_button.disabled = true;

        save_download.disabled = true;
        save_upload.disabled = true;
        save_delete.disabled = true;
    }

    /** @type {string[]} */
    const cached_list = await listCachedVersions()
    if (cached_list.indexOf(versionId) == -1) {
        throw new Error("Unknown version '" + versionId + "'")
    }
    loaded_game_id = versionId;

    loaded_version_name.innerText = loaded_game_id

    run_button.disabled = false;

    run_button.onclick = function() {
        runVersion(loaded_game_id)
    }

    download_cache_button.disabled = false;

    download_cache_button.onclick = async function() {
        status_text.innerText = "Loading Game"
        progress_bar.value = 0;

        const game = await loadCachedGame(loaded_game_id)

        status_text.innerText = "Saving"
        progress_bar.value = 50;

        saveAs(game, "balatro_" + loaded_game_id + ".zip")

        status_text.innerText = "Ready"
        progress_bar.value = 0;
    }

    make_portable_button.disabled = false;

    make_portable_button.onclick = async function() {
        const game = await loadCachedGame(loaded_game_id)

        status_text.innerText = "Fetching Template"
        progress_bar.value = 0;
        var s = document.createElement('script');
        s.type = 'text/javascript';
        s.src = "single_file.js"; // THICC FILE
        s.async = true;
        s.onload = async function () {
            status_text.innerText = "Filling Template"
            progress_bar.value = 30;
            const game_uri = await getDataURIFromBlob(game)

            const zip = new JSZip()
            for (const file_name of Object.keys(window.templates)) {
                progress_bar.value += 20;
                zip.file(file_name, window.templates[file_name].replace("%%DATAURI%%", game_uri).replace("%%VERSION_NAME%%", loaded_game_id))
            }
            status_text.innerText = "Zipping"
            progress_bar.value = 95;
            saveAs(await zip.generateAsync({type: "blob"}), "balatro.zip")
            
            status_text.innerText = "Ready"
            progress_bar.value = 0;
        };
        document.body.appendChild(s);
    }


    // ==========================================
    // DOWNLOAD CLOUD SAVE
    // ==========================================

    save_download.disabled = false;

    save_download.onclick = async function() {

        if (!cloud_username) {
            setCloudStatus("Please log in first.");
            return;
        }

        try {

            status_text.innerText = "Downloading Cloud Save";
            progress_bar.value = 10;

            const cloudSave = await getCloudSave();

            if (!cloudSave) {
                setCloudStatus(
                    "No cloud save exists for " + cloud_username
                );

                status_text.innerText = "Ready";
                progress_bar.value = 0;
                return;
            }

            // Decode Base64
            const binary = atob(cloudSave.save_data);
            const bytes = new Uint8Array(binary.length);

            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }

            const fileBlob = new Blob(
                [bytes],
                { type: "application/zip" }
            );

            status_text.innerText = "Extracting Cloud Save";
            progress_bar.value = 25;

            const zipFile = await JSZip.loadAsync(fileBlob);

            const DIR_PERMS = 16832;
            const FILE_PERMS = 33152;
            const SETTINGS_PERMS = 33206;

            const save_data_id =
                "Balatro_" +
                loaded_game_id +
                "_/home/web_user/love";

            status_text.innerText = "Opening Save Database";
            progress_bar.value = 40;

            const request =
                indexedDB.open(save_data_id);

            const db = await new Promise((resolve, reject) => {

                request.onsuccess = () =>
                    resolve(request.result);

                request.onerror = () =>
                    reject(request.error);
            });

            const zip_contents = {};

            for (const file of Object.values(zipFile.files)) {

                if (file.name.endsWith("/")) {
                    file.name =
                        file.name.slice(0, -1);
                }

                if (file.dir) {

                    zip_contents[
                        "/home/web_user/love/game/" +
                        file.name
                    ] = {
                        mode: DIR_PERMS,
                        timestamp: file.date
                    };

                } else {

                    const arrayBuffer =
                        await zipFile
                            .file(file.name)
                            .async("arrayBuffer");

                    zip_contents[
                        "/home/web_user/love/game/" +
                        file.name
                    ] = {
                        mode:
                            file.name == "settings.jkr"
                                ? SETTINGS_PERMS
                                : FILE_PERMS,

                        timestamp: file.date,

                        contents:
                            new Int8Array(arrayBuffer)
                    };
                }
            }

            // Clear existing save
            let tx =
                db.transaction(
                    "FILE_DATA",
                    "readwrite"
                );

            let store =
                tx.objectStore("FILE_DATA");

            status_text.innerText =
                "Clearing old save";

            progress_bar.value = 60;

            await new Promise((resolve, reject) => {

                const cursorRequest =
                    store.openCursor();

                cursorRequest.onsuccess =
                    async event => {

                        const cursor =
                            event.target.result;

                        if (cursor) {

                            await unwrapIDBRequest(
                                store.delete(cursor.key)
                            );

                            cursor.continue();

                        } else {

                            resolve();
                        }
                    };

                cursorRequest.onerror =
                    () => reject(cursorRequest.error);
            });

            // Write cloud save into IndexedDB
            tx = db.transaction(
                "FILE_DATA",
                "readwrite"
            );

            store = tx.objectStore("FILE_DATA");

            status_text.innerText =
                "Restoring Save";

            progress_bar.value = 80;

            store.add(
                {
                    mode: DIR_PERMS,
                    timestamp: new Date()
                },
                "/home/web_user/love/game"
            );

            for (
                const [name, data]
                of Object.entries(zip_contents)
            ) {
                store.add(data, name);
            }

            await new Promise((resolve, reject) => {

                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);

            });

            db.close();

            progress_bar.value = 100;

            status_text.innerText = "Ready";

            setCloudStatus(
                "Cloud save loaded for " +
                cloud_username
            );

            setTimeout(() => {
                progress_bar.value = 0;
            }, 1000);

        } catch (error) {

            console.error(error);

            status_text.innerText = "Cloud Save Error";

            setCloudStatus(
                "Download failed: " +
                error.message
            );

            progress_bar.value = 0;
        }
    };


    // ==========================================
    // UPLOAD CLOUD SAVE (reusable function)
    // ==========================================

    async function uploadCurrentSaveToCloud(save_data_id) {

        if (!cloud_username) {
            setCloudStatus("Please log in first.");
            return;
        }

        if (!save_data_id) {
            save_data_id =
                "Balatro_" +
                loaded_game_id +
                "_/home/web_user/love";
        }

        try {

            status_text.innerText =
                "Opening Save Database";

            progress_bar.value = 5;

            const request =
                indexedDB.open(save_data_id);

            const db = await new Promise((resolve, reject) => {

                request.onsuccess = () =>
                    resolve(request.result);

                request.onerror = () =>
                    reject(request.error);
            });

            if (!db.objectStoreNames.contains("FILE_DATA")) {
                db.close();
                throw new Error(
                    "Save database is not ready yet."
                );
            }

            const tx =
                db.transaction(
                    "FILE_DATA",
                    "readonly"
                );

            const store =
                tx.objectStore("FILE_DATA");

            status_text.innerText =
                "Reading Save";

            progress_bar.value = 15;

            const files =
                await new Promise((resolve, reject) => {

                    const allFiles = {};

                    const cursorRequest =
                        store.openCursor();

                    cursorRequest.onsuccess =
                        event => {

                            const cursor =
                                event.target.result;

                            if (cursor) {

                                const path =
                                    cursor.key.replace(
                                        "/home/web_user/love/game/",
                                        ""
                                    );

                                const metadata =
                                    cursor.value;

                                if (metadata.contents) {

                                    allFiles[path] =
                                        new Blob([
                                            metadata.contents
                                        ]);
                                }

                                cursor.continue();

                            } else {

                                resolve(allFiles);
                            }
                        };

                    cursorRequest.onerror =
                        () => reject(
                            cursorRequest.error
                        );
                });

            db.close();

            const zip = new JSZip();

            const fileEntries =
                Object.entries(files);

            let count = 0;

            for (
                const [path, blob]
                of fileEntries
            ) {

                zip.file(
                    path,
                    blob,
                    {
                        createFolders: true
                    }
                );

                count++;

                progress_bar.value =
                    15 +
                    (count / fileEntries.length) * 40;
            }

            status_text.innerText =
                "Creating Cloud Save";

            progress_bar.value = 60;

            const zipBlob =
                await zip.generateAsync({
                    type: "blob"
                });

            status_text.innerText =
                "Preparing Upload";

            progress_bar.value = 70;

            // Convert ZIP to Base64
            const arrayBuffer =
                await zipBlob.arrayBuffer();

            const bytes =
                new Uint8Array(arrayBuffer);

            let binary = "";

            const chunkSize = 0x8000;

            for (
                let i = 0;
                i < bytes.length;
                i += chunkSize
            ) {

                binary += String.fromCharCode(
                    ...bytes.subarray(
                        i,
                        Math.min(
                            i + chunkSize,
                            bytes.length
                        )
                    )
                );
            }

            const base64 =
                btoa(binary);

            status_text.innerText =
                "Uploading to Supabase";

            progress_bar.value = 85;

            await uploadCloudSave(base64);

            progress_bar.value = 100;

            status_text.innerText =
                "Ready";

            setCloudStatus(
                "Cloud save uploaded for " +
                cloud_username
            );

            setTimeout(() => {
                progress_bar.value = 0;
            }, 1000);

        } catch (error) {

            console.error(error);

            status_text.innerText =
                "Cloud Save Error";

            setCloudStatus(
                "Upload failed: " +
                error.message
            );

            progress_bar.value = 0;

            throw error;
        }
    }

    // Expose the uploader so the file-scoped auto-save timer
    // can call the latest version after each loadVersion().
    window.uploadCurrentSaveToCloud = uploadCurrentSaveToCloud;

    save_upload.disabled = false;

    save_upload.onclick = uploadCurrentSaveToCloud;


    // ==========================================
    // DELETE CLOUD SAVE
    // ==========================================

    save_delete.disabled = false;

    save_delete.onclick = async function() {

        if (!cloud_username) {
            setCloudStatus("Please log in first.");
            return;
        }

        if (!confirm(
            "Delete the cloud save for '" +
            cloud_username +
            "'?"
        )) {
            return;
        }

        try {

            status_text.innerText =
                "Deleting Cloud Save";

            progress_bar.value = 50;

            await deleteCloudSave();

            progress_bar.value = 100;

            status_text.innerText =
                "Ready";

            setCloudStatus(
                "Cloud save deleted."
            );

            setTimeout(() => {
                progress_bar.value = 0;
            }, 1000);

        } catch (error) {

            console.error(error);

            status_text.innerText =
                "Cloud Save Error";

            setCloudStatus(
                "Delete failed: " +
                error.message
            );

            progress_bar.value = 0;
        }
    };


    // ==========================================
    // START AUTO SAVE (only after a version is loaded)
    // ==========================================

    startAutoSave();
}


// ==========================================
// BALATRO SUPABASE CLOUD SAVES
// ==========================================

let cloud_username = null;

function cloudHeaders() {
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json"
    };
}

function setCloudStatus(message) {
    const element = document.getElementById("cloud-status");

    if (element) {
        element.textContent = message;
    }
}

function cleanUsername(username) {
    return username
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "")
        .substring(0, 32);
}


// ==========================================
// LOGIN
// ==========================================

function setupCloudLogin() {

    const loginButton =
        document.getElementById("cloud-login-button");

    const usernameInput =
        document.getElementById("cloud-username");

    const logoutButton =
        document.getElementById("cloud-logout");

    if (!loginButton) {
        console.error("Cloud save UI not found.");
        return;
    }

    loginButton.onclick = async function () {

        const username =
            cleanUsername(usernameInput.value);

        if (!username) {
            setCloudStatus("Enter a username.");
            return;
        }

        cloud_username = username;

        document
            .getElementById("cloud-login")
            .classList.add("hidden");

        document
            .getElementById("cloud-user")
            .classList.remove("hidden");

        document
            .getElementById("cloud-username-display")
            .textContent = username;

        document
            .getElementById("save-download")
            .disabled = false;

        document
            .getElementById("save-upload")
            .disabled = false;

        document
            .getElementById("save-delete")
            .disabled = false;

        setCloudStatus(
            "Logged in as " + username
        );

        try {

            const response = await fetch(
                SUPABASE_URL +
                "/rest/v1/balatro_saves?username=eq." +
                encodeURIComponent(username) +
                "&select=username,updated_at",
                {
                    headers: cloudHeaders()
                }
            );

            if (!response.ok) {
                throw new Error(
                    await response.text()
                );
            }

            const saves = await response.json();

            if (saves.length) {

                setCloudStatus(
                    "Cloud save found. Last updated: " +
                    new Date(
                        saves[0].updated_at
                    ).toLocaleString()
                );

            } else {

                setCloudStatus(
                    "No cloud save yet. Upload one!"
                );
            }

        } catch (error) {

            console.error(error);

            setCloudStatus(
                "Cloud connection failed."
            );
        }
    };


    logoutButton.onclick = function () {

        cloud_username = null;

        document
            .getElementById("cloud-login")
            .classList.remove("hidden");

        document
            .getElementById("cloud-user")
            .classList.add("hidden");

        document
            .getElementById("save-download")
            .disabled = true;

        document
            .getElementById("save-upload")
            .disabled = true;

        document
            .getElementById("save-delete")
            .disabled = true;

        setCloudStatus("Not logged in.");
    };
}


// ==========================================
// DOWNLOAD FROM SUPABASE
// ==========================================

async function getCloudSave() {

    if (!cloud_username) {
        throw new Error("Not logged in.");
    }

    const response = await fetch(
        SUPABASE_URL +
        "/rest/v1/balatro_saves?username=eq." +
        encodeURIComponent(cloud_username) +
        "&select=save_data,updated_at",
        {
            headers: cloudHeaders()
        }
    );

    if (!response.ok) {
        throw new Error(
            await response.text()
        );
    }

    const data = await response.json();

    if (!data.length) {
        return null;
    }

    return data[0];
}


// ==========================================
// UPLOAD TO SUPABASE
// ==========================================

async function uploadCloudSave(saveData) {

    if (!cloud_username) {
        throw new Error("Not logged in.");
    }

    const response = await fetch(
        SUPABASE_URL +
        "/rest/v1/balatro_saves",
        {
            method: "POST",

            headers: {
                ...cloudHeaders(),

                "Prefer":
                    "resolution=merge-duplicates"
            },

            body: JSON.stringify({
                username: cloud_username,
                save_data: saveData,
                updated_at:
                    new Date().toISOString()
            })
        }
    );

    if (!response.ok) {

        throw new Error(
            await response.text()
        );
    }
}


// ==========================================
// DELETE CLOUD SAVE
// ==========================================

async function deleteCloudSave() {

    if (!cloud_username) {
        throw new Error("Not logged in.");
    }

    const response = await fetch(
        SUPABASE_URL +
        "/rest/v1/balatro_saves?username=eq." +
        encodeURIComponent(cloud_username),
        {
            method: "DELETE",
            headers: cloudHeaders()
        }
    );

    if (!response.ok) {

        throw new Error(
            await response.text()
        );
    }
}


// ==========================================
// FIND READY SAVE DATABASE
// ==========================================

async function findReadySaveDatabase() {

    if (!loaded_game_id) {
        return null;
    }

    const expected =
        "Balatro_" +
        loaded_game_id +
        "_/home/web_user/love";

    let list;
    try {
        list = await indexedDB.databases();
    } catch (err) {
        // indexedDB.databases() isn't supported - just use
        // the expected name and let the uploader handle it.
        return expected;
    }

    // Build candidates: exact match first, then any other
    // Balatro save DB containing the same mount path.
    const candidates = [];

    for (const info of list) {
        if (!info.name) continue;

        if (info.name === expected) {
            candidates.unshift(info.name);
        } else if (
            info.name.startsWith("Balatro_") &&
            info.name.includes("/home/web_user/love")
        ) {
            candidates.push(info.name);
        }
    }

    // Return the first one that actually has FILE_DATA.
    for (const name of candidates) {

        let db;

        try {
            db = await new Promise((resolve, reject) => {
                const req = indexedDB.open(name);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        } catch (err) {
            continue;
        }

        const has = db.objectStoreNames.contains("FILE_DATA");
        db.close();

        if (has) {
            return name;
        }
    }

    return null;
}


// ==========================================
// AUTOMATIC CLOUD SAVE
// ==========================================

let autoSaveTimer = null;
let autoSaveRunning = false;

function startAutoSave() {

    if (autoSaveTimer) {
        clearInterval(autoSaveTimer);
    }

    autoSaveTimer = setInterval(async () => {

        if (!cloud_username || !loaded_game_id) {
            return;
        }

        if (autoSaveRunning) {
            return;
        }

        if (typeof window.uploadCurrentSaveToCloud !== "function") {
            return;
        }

        autoSaveRunning = true;

        try {

            const dbName = await findReadySaveDatabase();

            if (!dbName) {
                console.log(
                    "[Cloud Save] No ready save database yet."
                );
                return;
            }

            await window.uploadCurrentSaveToCloud(dbName);

            console.log(
                "[Cloud Save] Auto-saved (" + dbName + ") at " +
                new Date().toLocaleTimeString()
            );

            setCloudStatus(
                "Auto-saved • " +
                new Date().toLocaleTimeString()
            );

        } catch (error) {

            console.error(
                "[Cloud Save] Auto-save failed:",
                error
            );

        } finally {

            autoSaveRunning = false;
        }

    }, 20000);
}


// ==========================================
// START LOGIN SYSTEM
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    setupCloudLogin
);
