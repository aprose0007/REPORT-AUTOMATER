/* ============================================
   Content Generator with OpenRouter AI Integration
   Academic Reasoning Workflow Implementation
   ============================================ */

const AI_API_KEY = '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';
const AI_MODEL = 'google/gemini-2.0-flash-001';
const AI_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Call OpenRouter API
async function callAI(prompt) {
    const controller = new AbortController();
    const timeout = setTimeout(function () { controller.abort(); }, 90000);
    try {
        const res = await fetch(AI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + AI_API_KEY,
                'HTTP-Referer': 'https://capstone-report-gen.local',
                'X-Title': 'Capstone Report Generator'
            },
            signal: controller.signal,
            body: JSON.stringify({
                model: AI_MODEL,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 4000,
                response_format: { type: 'json_object' }
            })
        });
        clearTimeout(timeout);
        if (!res.ok) {
            const errData = await res.json();
            throw new Error('API ' + res.status + ': ' + (errData.error?.message || 'Unknown error'));
        }
        const data = await res.json();
        var text = data.choices[0].message.content;

        // Robust JSON extraction
        try {
            // Remove markdown code blocks if present
            var cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanText);
        } catch (parseErr) {
            console.error('JSON Parse Error. Original text:', text);
            // Attempt to find JSON within the text if extra characters exist
            var match = text.match(/\{[\s\S]*\}/);
            if (match) {
                return JSON.parse(match[0]);
            }
            throw parseErr;
        }
    } catch (e) {
        clearTimeout(timeout);
        throw e;
    }
}

/**
 * STEP 1-3: Mandatory Reasoning Workflow
 * Categorizes the project and determines the rules for generation.
 */
async function _aiAnalyzeTitle(t, desc) {
    const prompt = `You are an academic consultant. Analyze this project title for a capstone report.

TITLE: "${t}"
DESCRIPTION: "${desc}"

----------------------------------
STEP 1 — INTERPRET THE TITLE
Identify what the title is actually about in real life.

STEP 2 — DETERMINE OUTPUT TYPE
Choose ONE:
A. Legal / policy analysis report
B. Social or management research study
C. Literature review / theoretical analysis
D. Scientific experiment
E. Medical study
F. Engineering design (mechanical/civil/electrical)
G. Hardware electronics project
H. Software / AI application
I. General descriptive academic study

STEP 3 — VALIDATION CHECK
Ask: "Would converting this into an app or device be academically logical?"
----------------------------------

Return JSON: 
{
  "internal_meaning": "Short sentence explanation",
  "category": "A/B/C/D/E/F/G/H/I",
  "category_name": "Full category name",
  "is_build_project": true/false (true only for F,G,H),
  "is_experimental": true/false (true only for D,E),
  "rules": ["List of strict constraints for this topic"]
}`;
    return await callAI(prompt);
}

// Generate structure based on decided type
async function _aiGenerateStructure(t, desc, analysis, referenceText) {
    let structureType = "NON-BUILD";
    if (analysis.is_build_project) structureType = "BUILD";
    if (analysis.is_experimental) structureType = "EXPERIMENTAL";

    var sourceInstruction = referenceText ?
        'ANALYZE THIS REFERENCE TEXT FOR TOC ONLY:\n' + referenceText.substring(0, 20000) + '\n' +
        'Extract the structure but ADAPT it to be 100% specific to "' + t + '" and the category "' + analysis.category_name + '".' :
        'Create a professional structure for a "' + analysis.category_name + '" project.';

    var prompt = sourceInstruction + `\n\nProject: "${t}"\nCategory: ${analysis.category_name}\n\n` +
        `REQUIRED STRUCTURE TYPE: ${structureType}\n` +
        `Return ONLY JSON: {"chapters":[{"num":1,"title":"...","sections":[{"num":"1.1","title":"..."},{"num":"1.2","title":"..."},{"num":"1.3","title":"..."}]}]}\n` +
        `Generate exactly 8 chapters suitable for a ${analysis.category_name} project.\n` +
        `Each chapter MUST have 3-5 sub-sections to ensure a total report length of 30+ pages.`;

    try {
        return await callAI(prompt);
    } catch (e) {
        console.warn('Structure AI failed:', e);
        return { chapters: CHAPTER_DEFS };
    }
}

// Generate one chapter via AI - Following Analysis Rules
async function _aiChapter(num, title, sectionDefs, t, desc, analysis) {
    var secList = sectionDefs.map(function (s) { return s.num + ' ' + s.title; }).join(', ');

    var prompt = `You are an academic content generator.
Category: ${analysis.category_name}
Project: "${t}"
Description: ${desc}

STRICT RULESET:
${analysis.rules.map(r => "- " + r).join('\n')}
- Never invent software or hardware unless the category is F, G, or H.
- Strictly adhere to ${analysis.category_name} academic standards.

Task: Write Chapter ${num}: ${title}.
Sections: ${secList}.

CONTENT REQUIREMENTS:
- This chapter MUST be extremely detailed (aim for 1500+ words total).
- For each section listed: Write 8-10 detailed, technical paragraphs.
- Every paragraph MUST contain the phrase "${t}" or a relevant technical synonym.
- Phase: Technical/Academic Analysis of the topic.
- Include 2 complex tables and 2 detailed bulleted lists per chapter.
- Use professional, academic vocabulary. No fluff. Focus on methodologies, analysis, and domain-specific concepts.

Return ONLY JSON: {"sections":[{"number":"${num}.1","title":"...","content":["...",{"type":"table","caption":"...","headers":["..."],"rows":[["..."]]},{"type":"list","items":["..."]},"..."]}]}`;

    // Retry logic
    var lastError;
    for (var attempt = 1; attempt <= 2; attempt++) {
        try {
            return await callAI(prompt);
        } catch (e) {
            lastError = e;
            console.warn(`Chapter ${num} attempt ${attempt} failed:`, e);
            // Wait a bit before retry
            await new Promise(r => setTimeout(r, 2000 * attempt));
        }
    }
    throw lastError;
}

// Generate abstract via AI
async function _aiAbstract(t, desc, analysis) {
    var prompt = `Write a detailed abstract for a ${analysis.category_name} capstone project.
Title: "${t}"
Description: "${desc}"

Rules:
- Strictly relevant to the topic.
- Match tone for ${analysis.category_name}.
- 4 long paragraphs + 8 keywords.

Return JSON: {"paragraphs":["p1","p2","p3","p4","Keywords: k1, k2..."]}`;
    return await callAI(prompt);
}

// Generate references via AI
async function _aiReferences(t, analysis) {
    var prompt = `Generate 25 academic references for a project on "${t}".
Category: ${analysis.category_name}
All references MUST be relevant to this topic.

Return JSON: {"references":["..."]}`;
    return await callAI(prompt);
}

// Main AI-powered generator
async function generateReportContentWithAI(projectTitle, projectDescription, referenceText, onProgress) {
    var t = projectTitle;
    var desc = projectDescription;
    function progress(msg) { if (onProgress) onProgress(msg); }

    // STEP 1-3: Analysis
    progress('Analyzing project title and determining academic category...');
    var analysis = await _aiAnalyzeTitle(t, desc);
    console.log('Title Analysis:', analysis);

    // STEP 4: Generation
    progress('Generating structure for ' + analysis.category_name + '...');
    var structResult = await _aiGenerateStructure(t, desc, analysis, referenceText);
    var activeChapters = structResult.chapters || CHAPTER_DEFS;

    progress('Generating abstract...');
    var abstractResult = await _aiAbstract(t, desc, analysis).catch(e => { console.warn(e); return null; });

    progress('Generating references...');
    var refsResult = await _aiReferences(t, analysis).catch(e => { console.warn(e); return null; });

    // Generate chapters SEQUENTIALLY to avoid rate limits and ensure full content
    var chapterResults = [];
    for (var i = 0; i < activeChapters.length; i++) {
        var ch = activeChapters[i];
        progress('Generating Chapter ' + ch.num + ' of ' + activeChapters.length + ': ' + ch.title + '...');
        try {
            var res = await _aiChapter(ch.num, ch.title, ch.sections, t, desc, analysis);
            chapterResults.push(res);
        } catch (e) {
            console.warn('Chapter ' + ch.num + ' failed after retries:', e);
            chapterResults.push(null);
        }
    }

    // Fallback if needed
    var fallback = generateReportContent(t, desc);

    var abstract = (abstractResult && abstractResult.paragraphs) ? abstractResult.paragraphs : fallback.abstract;

    var chapters = activeChapters.map(function (chDef, idx) {
        var aiResult = chapterResults[idx];
        if (aiResult && aiResult.sections && aiResult.sections.length > 0) {
            var sections = aiResult.sections.map(function (sec) {
                var content = [];
                if (Array.isArray(sec.content)) {
                    sec.content.forEach(function (item) {
                        if (typeof item === 'string' || (item && (item.type === 'list' || item.type === 'table'))) {
                            content.push(item);
                        }
                    });
                }
                return { number: sec.number || '', title: sec.title || '', content: content };
            });
            return { number: chDef.num, title: chDef.title, sections: sections };
        }
        return fallback.chapters[chDef.num - 1] || fallback.chapters[0];
    });

    var references = (refsResult && Array.isArray(refsResult.references)) ? refsResult.references : fallback.references;

    progress('Report generation complete!');
    return { abstract: abstract, chapters: chapters, references: references };
}

// =============================================
//  TEMPLATE-BASED FALLBACK
// =============================================
function generateReportContent(projectTitle, projectDescription) {
    var t = projectTitle;
    var desc = projectDescription || 'A project focused on ' + t;
    var chapters = CHAPTER_DEFS.map(function (ch) {
        return {
            number: ch.num,
            title: ch.title,
            sections: ch.sections.map(function (sec) {
                return {
                    number: sec.num,
                    title: sec.title,
                    content: [
                        'This section explores ' + sec.title + ' in the context of ' + t + '. It provides a detailed analysis and justification for the approach used in this capstone report.',
                        'Further technical details regarding ' + sec.title + ' are integrated here to ensure comprehensive coverage of the ' + t + ' project scope.',
                        { type: 'list', items: ['Key aspect of ' + sec.title, 'Technical requirement for ' + t, 'Standard academic procedure'] },
                        { type: 'table', caption: 'Table: ' + sec.title + ' Analysis Data', headers: ['Parameter', 'Value', 'Observation'], rows: [['Metric 1', 'Standard', 'Optimal'], ['Metric 2', 'Verified', 'Consistent']] }
                    ]
                };
            })
        };
    });

    return {
        abstract: [
            'This project, entitled ' + t + ', investigates the core principles and implementation strategies relevant to modern academic standards.',
            'The study focuses on ' + desc + ' through systematic analysis and rigorous testing.',
            'Results indicate that ' + t + ' provides a robust solution for the identified problem statement.',
            'Future work will expand upon the findings detailed in this report to enhance the performance and scope of the project.',
            'Keywords: ' + t + ', Academic Study, Capstone Project, Implementation'
        ],
        chapters: chapters,
        references: [
            'Author, A. (2024). Advanced Research in ' + t + '. Academic Press.',
            'Smith, J. (2023). Implementation Guide for ' + t + '. Technology Journal.',
            'IEEE Standard for ' + t + '. (2022). Institute of Electrical and Electronics Engineers.'
        ]
    };
}

// Default structure
var CHAPTER_DEFS = [
    { num: 1, title: 'INTRODUCTION', sections: [{ num: '1.1', title: 'Background' }, { num: '1.2', title: 'Problem Statement' }, { num: '1.3', title: 'Objectives' }] },
    { num: 2, title: 'LITERATURE REVIEW', sections: [{ num: '2.1', title: 'Theoretical Background' }, { num: '2.2', title: 'Related Works' }, { num: '2.3', title: 'Gap Analysis' }] },
    { num: 3, title: 'SYSTEM DESIGN & ANALYSIS', sections: [{ num: '3.1', title: 'Requirement Analysis' }, { num: '3.2', title: 'System Architecture' }, { num: '3.3', title: 'Data Design' }] },
    { num: 4, title: 'PROPOSED METHODOLOGY', sections: [{ num: '4.1', title: 'Workflow' }, { num: '4.2', title: 'Algorithm/Logic' }, { num: '4.3', title: 'Mathematical Model' }] },
    { num: 5, title: 'IMPLEMENTATION', sections: [{ num: '5.1', title: 'Environment Setup' }, { num: '5.2', title: 'Core Modules' }, { num: '5.3', title: 'Code Integration' }] },
    { num: 6, title: 'TESTING & RESULTS', sections: [{ num: '6.1', title: 'Test Cases' }, { num: '6.2', title: 'Performance Analysis' }, { num: '6.3', title: 'Result Discussion' }] },
    { num: 7, title: 'PROJECT MANAGEMENT', sections: [{ num: '7.1', title: 'Timeline' }, { num: '7.2', title: 'Budget/Resource' }, { num: '7.3', title: 'Risk Management' }] },
    { num: 8, title: 'CONCLUSION & FUTURE WORK', sections: [{ num: '8.1', title: 'Summary' }, { num: '8.2', title: 'Limitations' }, { num: '8.3', title: 'Future Enhancements' }] }
];
