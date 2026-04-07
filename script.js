const API_KEY = localStorage.getItem("api_key")


document.addEventListener("DOMContentLoaded", () => {

    setTimeout(() => {
        document.getElementById("main-loading").style.display = "none"
    }, 1500)
})


const textInput = document.getElementById("textInput");
const charCount = document.getElementById("charCount");

textInput.addEventListener("input", () => {
    let len = textInput.value.length;

    // hard limit safety (just in case paste bypasses)
    if (len > 25000) {
        textInput.value = textInput.value.slice(0, 25000);
        len = 25000;
    }

    charCount.innerText = `${len} / 25000`;

    // optional: warning color
    if (len > 24000) {
        charCount.style.color = "red";
    } else {
        charCount.style.color = "#aaa";
    }
});


function showTab(tab) {
    createTab.style.display = tab === 'create' ? 'flex' : 'none';
    savedTab.style.display = tab === 'saved' ? 'flex' : 'none';
    if (tab === 'saved') loadSaved();
}

document.querySelectorAll('input[name="plan"]').forEach(radio => {
    radio.addEventListener("change", () => {
        if (radio.id === "glass-silver") showTab("create");
        if (radio.id === "glass-gold") showTab("saved");
    });
});


const input = document.getElementById("pdfInput");
const fileName = document.getElementById("fileName");

input.addEventListener("change", () => {
    fileName.textContent = input.files[0]?.name || "No file chosen";
});




let qcount = 30;

function changeCount(value) {
    qcount += value;

    if (qcount < 10) qcount = 10;
    if (qcount > 200) qcount = 200;

    document.getElementById("count").innerText = qcount;
}



// Example: Get values (use this when generating questions)
let selectedDifficulty = "Mixed (Easy, Medium, Hard)";

function toggleDropdown() {
    const menu = document.getElementById("dropdown-options");
    menu.style.display = menu.style.display === "block" ? "none" : "block";
}

document.querySelectorAll(".option").forEach(option => {
    option.addEventListener("click", function () {
        const text = this.innerText;
        const value = this.getAttribute("data-value");

        document.getElementById("selected-text").innerText = text;
        selectedDifficulty = value;

        document.getElementById("dropdown-options").style.display = "none";
    });
});


document.addEventListener("click", function (e) {
    if (!e.target.closest(".dropdown")) {
        document.getElementById("dropdown-options").style.display = "none";
    }
});


let alertbox = document.getElementById("alert-box");
function showAlert(message) {
    alertbox.querySelector("p").innerText = message;
    alertbox.style.display = "flex";
    setTimeout(() => (alertbox.style.display = "none"), 2000);
}


async function startGeneration() {

    overlay.style.display = "none";
    overlay.querySelectorAll('p')[0].innerText = "";

    const text = textInput.value.trim();
    const file = pdfInput.files[0];
    const count = qcount;
    const difficulty = selectedDifficulty;



    if (text && file) return showAlert("Please provide either text or a PDF, not both.");

    if (text) return generateMCQ(text, count, difficulty);

    if (!file) return showAlert("Enter text or upload PDF");

    const reader = new FileReader();
    reader.onload = async () => {
        overlay.style.display = "flex";
        const pdf = await pdfjsLib.getDocument(new Uint8Array(reader.result)).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const c = await page.getTextContent();
            fullText += c.items.map(i => i.str).join(" ");
        }
        fullText = fullText.replace(/\s+/g, " ").slice(0, 25000);
        generateMCQ(fullText, count, difficulty);
    };
    reader.readAsArrayBuffer(file);
}

async function generateMCQ(text, totalCount, difficulty) {
    overlay.style.display = "flex";
    overlay.querySelectorAll('p')[0].innerText = "Generating MCQs...";
    let allQuestions = [];
    let title = "MCQ Set";
    let chunkSize = 30;
    let maxRetries = 3;

    while (allQuestions.length < totalCount) {
        let remaining = totalCount - allQuestions.length;
        let currentChunk = Math.min(chunkSize, remaining);

        let success = false;
        let retry = 0;

        while (!success && retry < maxRetries) {
            const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": location.origin,
                    "X-Title": "MCQ App"
                },
                body: JSON.stringify({
                    model: "openrouter/auto",
                    temperature: 0.2,
                    messages: [{
                        role: "user",
                        content: `You are a strict JSON generator.

Generate EXACTLY ${currentChunk} MCQs.

Rules:
- MUST return exactly ${currentChunk}
- difficulty should be ${difficulty}
- 4 options each
- 1 correct answer
- No explanation
- Output ONLY JSON (no markdown)

Format:
{
  "title": "",
  "questions": [
    {
      "question": "",
      "options": ["", "", "", ""],
      "answer": ""
    }
  ]
}

Text:
${text}`
                    }]
                })
            });

            const data = await res.json();

            try {
                let content = data.choices[0].message.content;
                content = content.replace(/```json|```/g, "").trim();

                const parsed = JSON.parse(content);

                if (parsed.questions && parsed.questions.length === currentChunk) {
                    allQuestions.push(...parsed.questions);

                    if (parsed.title && title === "MCQ Set") {
                        title = parsed.title;
                    }

                    success = true;
                } else {
                    throw new Error("Wrong count");
                }

            } catch (e) {
                retry++;
                overlay.querySelectorAll('p')[0].innerText = `Retrying chunk... (${retry}/3)`;
            }
        }

        if (!success) {
            overlay.querySelectorAll('p')[0].innerText = "Failed to generate full set after 3 retries. Please try again.";
            /* clear inputs */
            textInput.value = "";
            pdfInput.value = "";
            fileName.textContent = "No file chosen";
            selectedDifficulty = "Mixed (Easy, Medium, Hard)";
            qcount = 30;
            document.getElementById("selected-text").innerText = selectedDifficulty;
            document.getElementById("count").innerText = qcount;

            charCount.innerText = `0 / 25000`;


            setTimeout(() => {
                overlay.style.display = "none";
                overlay.querySelectorAll('p')[0].innerText = "";
            }, 2000);
            setTimeout(() => {
                location.reload(true);
            }, 2000);
            return;
        }

        // 👀 progress update
        overlay.querySelectorAll('p')[0].innerText = `Generating... ${allQuestions.length}/${totalCount}`;
    }

    const saveObj = {
        title: title,
        date: new Date().toLocaleString(),
        questions: allQuestions
    };

    saveToLocal(saveObj);

    overlay.querySelectorAll('p')[0].innerText = "MCQs Generated Successfully!";

    /* clear inputs */
    textInput.value = "";
    pdfInput.value = "";
    fileName.textContent = "No file chosen";
    selectedDifficulty = "Mixed (Easy, Medium, Hard)";
    qcount = 30;
    document.getElementById("selected-text").innerText = selectedDifficulty;
    document.getElementById("count").innerText = qcount;
    charCount.innerText = `0 / 25000`;

    setTimeout(() => {
        overlay.style.display = "none";
        overlay.querySelectorAll('p')[0].innerText = "";
    }, 1000);


}


function saveToLocal(data) {
    const all = JSON.parse(localStorage.getItem("mcqSets") || "[]");
    all.push(data);
    localStorage.setItem("mcqSets", JSON.stringify(all));
}

function loadSaved() {
    savedTab.innerHTML = "";
    const all = JSON.parse(localStorage.getItem("mcqSets") || "[]");

    all.forEach((set, index) => {
        const btn = document.createElement("button");
        btn.classList.add("set-btn");

        // text
        const text = document.createElement("span");
        text.innerText = `${set.title} (${set.date})`;

        // delete image
        const bin = document.createElement("img");
        bin.src = "delete.png";
        bin.classList.add("bin");

        bin.onclick = (e) => {
            e.stopPropagation();
            deleteSet(index);
        };

        btn.onclick = () => openSet(set);

        btn.appendChild(text);
        btn.appendChild(bin);

        savedTab.appendChild(btn);
    });
}


function deleteSet(index) {
    let all = JSON.parse(localStorage.getItem("mcqSets") || "[]");
    all.splice(index, 1);
    localStorage.setItem("mcqSets", JSON.stringify(all));
    loadSaved();
}



function openSet(set) {

    const questionsJSON = JSON.stringify(set.questions).replace(/</g, "\\u003c");

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta charset="UTF-8">
<title>${set.title}</title>
<style>
* {
    margin: 0;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
}

body {
    font-family: Arial;
    padding: 10px
}

h2 {
    text-align: center;
    font-family: 'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', 'Lucida Sans', Arial, sans-serif;
    margin-top: 10px;
    margin-bottom: 20px;
    color: rgb(1, 40, 78);
}

#msg {
    text-align: center;
    font-size: 24px;
    margin-top: 20px;
}

button {
    font-size: 18px;
    padding: 0.5em 1em;
    border: transparent;
    box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.4);
    background: dodgerblue;
    color: white;
    border-radius: 4px;
}

.btns {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin-top: 20px;
}

input[type="radio"] {
    transform: scale(1.2);
    margin-right: 5px;
    accent-color: dodgerblue;
}

.mcq {
    margin: 10px 0;
    padding: 10px;
    border: 1px solid #ccc
}

.mcq p {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    margin-bottom: 15px;
}

.mcq p:last-child {
    margin-top: 15px;
    background-color: rgb(138, 138, 138);
    color: white;
    width: fit-content;
    padding: 5px;
    margin-bottom: 0;
}

.mcq label {
    cursor: pointer;
    margin-bottom: 5px;
    display: block;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

#showBtn {
    display: none;
}

.correct {
    background: lightgreen
}

.wrong {
    background: #ffb3b3
}
</style>
</head>
<body>
<h2>${set.title}</h2>
<div id="container"></div>
<div id="msg"></div>
<div class="btns">
    <button id="submitBtn">Submit</button>
    <button id="showBtn">Show Answers</button>
</div>


<script>
const data = ${questionsJSON};

function render(){
const c=document.getElementById("container");
data.forEach((q,i)=>{
let div=document.createElement("div");
div.className="mcq";
div.id="q"+i;

let p=document.createElement("p");
p.innerText = (i+1)+". "+q.question;
div.appendChild(p);

q.options.forEach(opt=>{
let label=document.createElement("label");
let radio=document.createElement("input");
radio.type="radio";
radio.name="q"+i;
radio.value=opt;
label.appendChild(radio);
label.append(" "+opt);
div.appendChild(label);
});

c.appendChild(div);
});
}

function submitQuiz(){
let score=0;
data.forEach((q,i)=>{
const sel=document.querySelector('input[name="q'+i+'"]:checked');
const div=document.getElementById("q"+i);
if(sel && sel.value===q.answer){score++;div.classList.add("correct");}
else{div.classList.add("wrong");}
});
let msg = "You Scored: " + score + "/" + data.length;
document.getElementById("msg").innerText = msg;
document.getElementById("showBtn").style.display = "block";
document.getElementById("submitBtn").style.display = "none";
}

function showAns(){
data.forEach((q,i)=>{
const div=document.getElementById("q"+i);
let ans=document.createElement("p");
ans.innerHTML="<b>Ans:</b> "+q.answer;
div.appendChild(ans);
});
document.getElementById("showBtn").style.display = "none";
}

document.getElementById("submitBtn").onclick = submitQuiz;
document.getElementById("showBtn").onclick = showAns;

render();
</script>
</body>
</html>`;

    let blob = new Blob([html], { type: "text/html" });
    let url = URL.createObjectURL(blob);

    window.open(url, "_blank");
}

function openMenu() {
    document.getElementById("sidebar").style.display = "block";
    document.getElementById("sidebar-toggle").style.display = "block";
}

function closeMenu() {
    document.getElementById("sidebar").style.display = "none";
    document.getElementById("sidebar-toggle").style.display = "none";
}


document.querySelectorAll(".question").forEach(q => {
    q.addEventListener("click", () => {
        q.classList.toggle("active");
        q.querySelector(".q img").style.transform = q.classList.contains("active") ? "rotate(180deg)" : "rotate(0deg)";
    });
});



document.getElementById("continueBtn").onclick = function () {
    let key = document.getElementById("apikeyinput").value.trim();
    if (!key) return;
    localStorage.setItem("api_key", key);
    document.getElementById("login").style.display = "none";
    setTimeout(() => {
                location.reload(true);
            }, 200);
}

// /* AUTO LOGIN */

if (localStorage.getItem("api_key")) {
    document.getElementById("login").style.display = "none";
}



function open_api_guide() {
    document.getElementById("apiGuide").style.display = "flex";
}

function open_about() {
    document.getElementById("about").style.display = "flex"
}
function close_about() {
    document.getElementById("about").style.display = "none"
}
/* API SETTINGS */

function changeAPI() {
    document.getElementById("login").style.display = "flex"
    document.getElementById("cross").style.display = "flex"
}
function closelogin() {
    document.getElementById("login").style.display = "none"
    document.getElementById("cross").style.display = "none"
}
function deleteAPI() {
    localStorage.removeItem("api_key")
    location.reload()
}

function delete_all() {
    localStorage.removeItem("mcqSets");
    showAlert("All saved MCQ sets have been deleted.");
    loadSaved();
    document.getElementById('delete-overlay').style.display = 'none';
    setTimeout(() => {
                location.reload(true);
            }, 200);
}

function contact() {
    window.open("https://lysosome.in", "_blank");
}


