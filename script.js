const API_KEY = "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";

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

const qInput = document.getElementById("qCount");

qInput.addEventListener("blur", () => {
    if (qInput.value === "") {
        qInput.value = 30;
        return;
    }

    let val = parseInt(qInput.value);

    if (val < 10) qInput.value = 10;
    if (val > 150) qInput.value = 150;
});

qInput.addEventListener("wheel", e => e.preventDefault());


async function startGeneration() {
    const text = textInput.value.trim();
    const file = pdfInput.files[0];
    const count = qCount.value;

    if (text && file) return alert("Use only one input!");

    if (text) return generateMCQ(text, count);

    if (!file) return alert("Enter text or upload PDF");

    const reader = new FileReader();
    reader.onload = async () => {
        const pdf = await pdfjsLib.getDocument(new Uint8Array(reader.result)).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const c = await page.getTextContent();
            fullText += c.items.map(i => i.str).join(" ");
        }
        fullText = fullText.replace(/\s+/g, " ").slice(0, 20000);
        generateMCQ(fullText, count);
    };
    reader.readAsArrayBuffer(file);
}

async function generateMCQ(text, count) {
    overlay.style.display = "flex";

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
            messages: [{
                role: "user",
                content: `You are a strict JSON generator.

Generate EXACTLY ${count} MCQs.

Important Rules:
- MUST return exactly ${count} questions (not less, not more)
- Each question must have 4 options
- One correct answer only
- No explanation
- Output ONLY valid JSON

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

    overlay.style.display = "none";

    try {
        const parsed = JSON.parse(data.choices[0].message.content);

        const saveObj = {
            title: parsed.title,
            date: new Date().toLocaleString(),
            questions: parsed.questions
        };

        saveToLocal(saveObj);
        alert("Generated & Saved!");

    } catch (e) {
        console.log(data);
        alert("Error generating MCQs");
    }
}

function saveToLocal(data) {
    const all = JSON.parse(localStorage.getItem("mcqSets") || "[]");
    all.push(data);
    localStorage.setItem("mcqSets", JSON.stringify(all));
}

function loadSaved() {
    savedTab.innerHTML = "";
    const all = JSON.parse(localStorage.getItem("mcqSets") || "[]");

    all.forEach(set => {
        const btn = document.createElement("button");
        btn.innerText = `${set.title} (${set.date})`;
        btn.onclick = () => openSet(set);
        savedTab.appendChild(btn);
    });
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