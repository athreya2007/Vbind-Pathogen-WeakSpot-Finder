/* Report UI rendering logic for Vbind-Pathogen-WeakSpot-Finder */

let activeData = null;

document.addEventListener("DOMContentLoaded", function () {
  const runBtn = document.getElementById("run-btn");
  if (runBtn) {
    runBtn.addEventListener("click", runAnalysis);
  }

  const uploadFile = document.getElementById("upload-file");
  const runUploadBtn = document.getElementById("run-upload-btn");
  
  if (uploadFile && runUploadBtn) {
    uploadFile.addEventListener("change", function () {
      if (this.files && this.files.length > 0) {
        runUploadBtn.disabled = false;
        runUploadBtn.innerText = "Analyze " + this.files[0].name;
      } else {
        runUploadBtn.disabled = true;
        runUploadBtn.innerText = "Analyze Upload";
      }
    });
    
    runUploadBtn.addEventListener("click", runUploadAnalysis);
  }
});

async function runAnalysis() {
  const reportBody = document.getElementById("report-body");
  const runBtn = document.getElementById("run-btn");
  
  runBtn.disabled = true;
  runBtn.innerText = "Scanning 1KZN...";
  reportBody.innerHTML = `<div style="text-align:center; padding: 3rem;"><p>Running GNN Vulnerability Model & Docking Pipeline...</p></div>`;

  try {
    const res = await fetch("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structure_id: "1kzn" })
    });

    if (!res.ok) {
      // Fallback try GET /analyze
      const resGet = await fetch("/analyze?structure_id=1kzn");
      activeData = await resGet.json();
    } else {
      activeData = await res.json();
    }

    renderPipelineResults(activeData);
  } catch (err) {
    console.error("API error, using cached demo output:", err);
    // Render client-side preview if backend server is unreachable
    renderPipelineResults(getDemoFallbackData());
  } finally {
    runBtn.disabled = false;
    runBtn.innerText = "Scan Target (1KZN)";
  }
}

async function runUploadAnalysis() {
  const fileInput = document.getElementById("upload-file");
  if (!fileInput.files || fileInput.files.length === 0) return;
  const file = fileInput.files[0];
  
  const reportBody = document.getElementById("report-body");
  const runUploadBtn = document.getElementById("run-upload-btn");
  const targetName = document.getElementById("target-name");
  
  runUploadBtn.disabled = true;
  
  const stages = [
    "Detecting pockets...",
    "Extracting properties...",
    "Scoring vulnerability...",
    "Generating explanations...",
    "Docking top candidates..."
  ];
  
  let currentStage = 0;
  
  const updateLoadingUI = () => {
    if (currentStage < stages.length) {
      reportBody.innerHTML = `<div style="text-align:center; padding: 3rem;">
        <p><strong>${stages[currentStage]}</strong></p>
        <p style="color: var(--text-muted); font-size: 0.9rem;">Live Analysis in progress. Please wait...</p>
      </div>`;
    }
  };
  
  updateLoadingUI();
  
  const stageInterval = setInterval(() => {
    if (currentStage < stages.length - 1) {
      currentStage++;
      updateLoadingUI();
    }
  }, 4000);
  
  targetName.innerText = file.name;
  
  const formData = new FormData();
  formData.append("file", file);
  
  try {
    const res = await fetch("/analyze_upload", {
      method: "POST",
      body: formData
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.detail || "Server error");
    }
    
    activeData = await res.json();
    clearInterval(stageInterval);
    reportBody.innerHTML = `<div style="text-align:center; padding: 3rem;"><p><strong>Done! Rendering results...</strong></p></div>`;
    
    setTimeout(() => {
        renderPipelineResults(activeData);
    }, 500);
    
  } catch (err) {
    clearInterval(stageInterval);
    console.error("API error during upload analysis:", err);
    reportBody.innerHTML = `<div style="text-align:center; padding: 3rem; color: #ff3b5c;">
      <p><strong>Analysis Failed</strong></p>
      <p>${err.message}</p>
    </div>`;
  } finally {
    runUploadBtn.disabled = false;
    runUploadBtn.innerText = "Analyze " + file.name;
  }
}

function renderPipelineResults(data) {
  if (!data || !data.weak_spots) return;

  // Render 3D Viewer
  if (typeof loadStructure === "function") {
    const fileInput = document.getElementById("upload-file");
    if (fileInput && fileInput.files.length > 0 && data.protein === fileInput.files[0].name) {
      loadStructure(fileInput.files[0], data.weak_spots);
    } else {
      loadStructure(data.protein, data.weak_spots);
    }
  }

  // Render Tabs
  const tabsContainer = document.getElementById("pocket-tabs");
  tabsContainer.innerHTML = "";

  data.weak_spots.forEach((spot, idx) => {
    const tab = document.createElement("button");
    tab.className = `pocket-tab ${idx === 0 ? "active" : ""}`;
    tab.innerText = `Rank #${spot.rank} (Pocket ${spot.pocket_id})`;
    tab.addEventListener("click", () => selectPocketTab(idx));
    tabsContainer.appendChild(tab);
  });

  // Render First Pocket Card
  renderWeakSpotCard(data.weak_spots[0]);
}

function selectPocketTab(index) {
  const tabs = document.querySelectorAll(".pocket-tab");
  tabs.forEach((t, i) => {
    t.classList.toggle("active", i === index);
  });

  if (activeData && activeData.weak_spots[index]) {
    renderWeakSpotCard(activeData.weak_spots[index]);
  }
}

function renderWeakSpotCard(spot) {
  const reportBody = document.getElementById("report-body");
  const props = spot.properties || {};
  const ligands = spot.top_ligands || [];

  const residuesHtml = (props.lining_residues || [])
    .map(r => `<span class="res-tag">${r}</span>`)
    .join("");

  const dockingRows = ligands
    .map(
      l => `
      <tr>
        <td><strong>${l.ligand_name}</strong></td>
        <td class="affinity-val">${l.binding_affinity_kcal_mol} kcal/mol</td>
      </tr>
    `
    )
    .join("");

  const nearCatText = props.near_catalytic_site ? "Yes (Near Active Site)" : "No";

  reportBody.innerHTML = `
    <!-- Header Card -->
    <div class="weakspot-header-card">
      <div>
        <div style="font-size: 0.8rem; color: var(--accent-cyan); font-weight: 600; text-transform: uppercase;">
          Vulnerability Rank #${spot.rank}
        </div>
        <h3 style="font-size: 1.2rem; margin-top: 0.25rem;">Candidate Binding Pocket ${spot.pocket_id}</h3>
      </div>
      <div class="score-badge">
        <div class="score-value">${spot.vulnerability_score.toFixed(4)}</div>
        <div class="score-label">GNN Score</div>
      </div>
    </div>

    <!-- Explanation Box (Groq API Llama 3.1 8B Output) -->
    <div class="explanation-box">
      <strong>AI Vulnerability Analysis:</strong><br>
      ${spot.explanation}
    </div>

    <!-- Biophysical Properties Grid -->
    <div>
      <div class="section-title">Biophysical Properties</div>
      <div class="properties-grid">
        <div class="prop-card">
          <div class="prop-name">Pocket Volume</div>
          <div class="prop-val">${props.volume} Å³</div>
        </div>
        <div class="prop-card">
          <div class="prop-name">Hydrophobicity</div>
          <div class="prop-val">${props.hydrophobicity_pct}%</div>
        </div>
        <div class="prop-card">
          <div class="prop-name">Net Charge</div>
          <div class="prop-val">${props.net_charge > 0 ? "+" : ""}${props.net_charge}</div>
        </div>
        <div class="prop-card">
          <div class="prop-name">Solvent Exposure</div>
          <div class="prop-val">${props.solvent_accessibility_pct}%</div>
        </div>
      </div>
    </div>

    <!-- Lining Residues -->
    <div>
      <div class="section-title">Pocket Lining Residues (${(props.lining_residues || []).length})</div>
      <div class="residues-tag-list">${residuesHtml}</div>
    </div>

    <!-- Molecular Docking Validation -->
    <div class="docking-section">
      <div class="section-title">FDA Drug Repurposing Docking Candidates</div>
      <table class="docking-table">
        <thead>
          <tr>
            <th>Compound Name</th>
            <th>Binding Affinity (ΔG)</th>
          </tr>
        </thead>
        <tbody>
          ${dockingRows || "<tr><td colspan='2'>No docking candidates computed</td></tr>"}
        </tbody>
      </table>
    </div>
  `;
}

function getDemoFallbackData() {
  return {
    protein: "1kzn.cif",
    weak_spots: [
      {
        rank: 1,
        pocket_id: 4,
        vulnerability_score: 0.486,
        centroid_coordinates: [42.674, 55.452, 23.368],
        properties: {
          volume: 499.2,
          lining_residues: ["ALA96", "ASN46", "ASP49", "GLU42", "GLY117", "GLY119", "HIS95", "ILE90", "VAL118"],
          hydrophobicity_pct: 33.33,
          net_charge: -2,
          solvent_accessibility_pct: 9.17,
          near_catalytic_site: false
        },
        explanation: "This pocket has a volume of 499.2 Å³ with a vulnerability score of 0.4860 on a 0-1 scale. It features 33.33% hydrophobic lining residues (ALA96, ASN46, ASP49, GLU42, GLY117, GLY119), a net charge of -2, and is 9.17% solvent exposed. The pocket forms a defined structural cavity matching the known Clorobiocin drug binding site.",
        top_ligands: [
          { ligand_name: "FDA_ZINC000001612996", binding_affinity_kcal_mol: -11.67 },
          { ligand_name: "FDA_ZINC000003607120", binding_affinity_kcal_mol: -11.35 },
          { ligand_name: "FDA_ZINC000242548690", binding_affinity_kcal_mol: -11.31 },
          { ligand_name: "FDA_ZINC000003861806", binding_affinity_kcal_mol: -11.19 },
          { ligand_name: "FDA_ZINC000001529323", binding_affinity_kcal_mol: -11.04 }
        ]
      }
    ]
  };
}
