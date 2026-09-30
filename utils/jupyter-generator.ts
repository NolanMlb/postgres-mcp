import type { ChartConfig } from "../types/index.js";

export class JupyterGenerator {
  /**
   * Generate a Jupyter notebook with interactive charts
   */
  static generate(config: ChartConfig): string {
    const { data, chartType, xColumn, yColumn, title } = config;

    const notebook = {
      cells: [
        this.createMarkdownCell(`# ${title}`),
        this.createMarkdownCell(
          `Généré le ${new Date().toLocaleString("fr-FR")}\n\n` +
            `**Lignes:** ${data.length}\n` +
            `**Type de graphique:** ${chartType}\n` +
            `**Axe X:** ${xColumn}\n` +
            `**Axe Y:** ${yColumn}`
        ),
        this.createCodeCell(this.generateImports()),
        this.createCodeCell(this.generateDataFrame(data)),
        this.createCodeCell(this.generateStatistics()),
        this.createCodeCell(
          this.generatePlot(chartType, xColumn, yColumn, title)
        ),
        this.createCodeCell(
          this.generateInteractivePlot(chartType, xColumn, yColumn, title)
        ),
        this.createMarkdownCell("## Tableau de données"),
        this.createCodeCell("df"),
      ],
      metadata: {
        kernelspec: {
          display_name: "Python 3",
          language: "python",
          name: "python3",
        },
        language_info: {
          name: "python",
          version: "3.11.0",
          mimetype: "text/x-python",
          codemirror_mode: {
            name: "ipython",
            version: 3,
          },
          pygments_lexer: "ipython3",
          nbconvert_exporter: "python",
          file_extension: ".py",
        },
      },
      nbformat: 4,
      nbformat_minor: 5,
    };

    return JSON.stringify(notebook, null, 2);
  }

  /**
   * Create markdown cell
   */
  private static createMarkdownCell(content: string): any {
    return {
      cell_type: "markdown",
      metadata: {},
      source: content.split("\n"),
    };
  }

  /**
   * Create code cell
   */
  private static createCodeCell(code: string): any {
    return {
      cell_type: "code",
      execution_count: null,
      metadata: {},
      outputs: [],
      source: code.split("\n"),
    };
  }

  /**
   * Generate imports
   */
  private static generateImports(): string {
    return `import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px
import plotly.graph_objects as go
from IPython.display import display

# Configuration du style
plt.style.use('seaborn-v0_8-darkgrid')
sns.set_palette("husl")
%matplotlib inline

print("✅ Bibliothèques chargées")`;
  }

  /**
   * Generate DataFrame creation code
   */
  /**
   * Generate DataFrame creation code (version sécurisée)
   */
  private static generateDataFrame(data: any[]): string {
    // Nettoyer et préparer les données
    const cleanData = data.map((row) => {
      const cleanRow: any = {};
      for (const [key, value] of Object.entries(row)) {
        // Dates
        if (value instanceof Date) {
          cleanRow[key] = value.toISOString();
        }
        // BigInt
        else if (typeof value === "bigint") {
          cleanRow[key] = Number(value);
        }
        // Null/undefined
        else if (value === null || value === undefined) {
          cleanRow[key] = null;
        }
        // Booléens
        else if (typeof value === "boolean") {
          cleanRow[key] = value;
        }
        // Nombres
        else if (typeof value === "number") {
          // Vérifier si c'est un nombre valide
          if (Number.isFinite(value)) {
            cleanRow[key] = value;
          } else {
            cleanRow[key] = null;
          }
        }
        // Strings
        else if (typeof value === "string") {
          cleanRow[key] = value;
        }
        // Objets complexes
        else if (typeof value === "object") {
          cleanRow[key] = JSON.stringify(value);
        } else {
          cleanRow[key] = String(value);
        }
      }
      return cleanRow;
    });

    // Encoder en base64 pour éviter les problèmes d'échappement
    const dataStr = JSON.stringify(cleanData);
    const base64Data = Buffer.from(dataStr).toString("base64");

    return `# Création du DataFrame depuis PostgreSQL
import json
import base64

# Données encodées (pour éviter les problèmes d'échappement)
data_b64 = "${base64Data}"
data_json = base64.b64decode(data_b64).decode('utf-8')
data = json.loads(data_json)

df = pd.DataFrame(data)

# Convertir les colonnes de dates automatiquement
for col in df.columns:
    if df[col].dtype == 'object':
        # Essayer de convertir en datetime
        try:
            df[col] = pd.to_datetime(df[col], errors='ignore')
        except:
            pass
    # Convertir les colonnes numériques si nécessaire
    elif df[col].dtype == 'object':
        try:
            df[col] = pd.to_numeric(df[col], errors='ignore')
        except:
            pass

print(f"📊 DataFrame créé: {len(df)} lignes, {len(df.columns)} colonnes")
print(f"Colonnes: {list(df.columns)}")
print(f"\\nTypes de données:")
print(df.dtypes)
print(f"\\nAperçu des données:")
df.head()`;
  }

  /**
   * Generate statistics code
   */
  private static generateStatistics(): string {
    return `# Statistiques descriptives
print("📈 Statistiques:")
print(df.describe())
print(f"\\n📊 Types de données:")
print(df.dtypes)`;
  }

  /**
   * Generate matplotlib plot
   */
  private static generatePlot(
    chartType: string,
    xColumn: string,
    yColumn: string,
    title: string
  ): string {
    let plotCode = "";

    switch (chartType) {
      case "line":
        plotCode = `plt.plot(df['${xColumn}'], df['${yColumn}'], marker='o', linewidth=2, markersize=8)`;
        break;
      case "bar":
        plotCode = `plt.bar(df['${xColumn}'], df['${yColumn}'], color='steelblue', alpha=0.8)`;
        break;
      case "area":
        plotCode = `plt.fill_between(df['${xColumn}'], df['${yColumn}'], alpha=0.5, color='steelblue')
  plt.plot(df['${xColumn}'], df['${yColumn}'], linewidth=2, color='darkblue')`;
        break;
      case "scatter":
        plotCode = `plt.scatter(df['${xColumn}'], df['${yColumn}'], s=100, alpha=0.6, c=df['${yColumn}'], cmap='viridis')
  plt.colorbar(label='${yColumn}')`;
        break;
      case "pie":
        plotCode = `plt.pie(df['${yColumn}'], labels=df['${xColumn}'], autopct='%1.1f%%', startangle=90)
  plt.axis('equal')`;
        break;
      default:
        plotCode = `plt.plot(df['${xColumn}'], df['${yColumn}'], marker='o')`;
    }

    return `# Graphique Matplotlib
plt.figure(figsize=(12, 6))
${plotCode}
plt.title("""${title}""", fontsize=16, fontweight='bold')
plt.xlabel('${xColumn}', fontsize=12)
plt.ylabel('${yColumn}', fontsize=12)
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()

print(f"📊 Graphique généré avec succès")`;
  }

  /**
   * Generate interactive Plotly plot
   */
  private static generateInteractivePlot(
    chartType: string,
    xColumn: string,
    yColumn: string,
    title: string
  ): string {
    let plotlyCode = "";

    switch (chartType) {
      case "line":
        plotlyCode = `fig = px.line(df, x='${xColumn}', y='${yColumn}', 
                title="""${title}""",
                markers=True,
                template='plotly_white')`;
        break;
      case "bar":
        plotlyCode = `fig = px.bar(df, x='${xColumn}', y='${yColumn}', 
               title="""${title}""",
               template='plotly_white',
               color='${yColumn}',
               color_continuous_scale='Blues')`;
        break;
      case "area":
        plotlyCode = `fig = px.area(df, x='${xColumn}', y='${yColumn}', 
                title="""${title}""",
                template='plotly_white')`;
        break;
      case "scatter":
        plotlyCode = `fig = px.scatter(df, x='${xColumn}', y='${yColumn}', 
                  title="""${title}""",
                  template='plotly_white',
                  size='${yColumn}',
                  color='${yColumn}',
                  color_continuous_scale='Viridis')`;
        break;
      case "pie":
        plotlyCode = `fig = px.pie(df, values='${yColumn}', names='${xColumn}', 
               title="""${title}""",
               template='plotly_white')`;
        break;
      default:
        plotlyCode = `fig = px.line(df, x='${xColumn}', y='${yColumn}', title="""${title}""")`;
    }

    return `# Graphique interactif Plotly
${plotlyCode}

fig.update_layout(
    font=dict(size=12),
    title_font_size=18,
    hovermode='x unified',
    height=500
)

fig.show()

print("🎨 Graphique interactif généré (survolez pour voir les détails)")`;
  }

  /**
   * Generate notebook with multiple chart types
   */
  static generateMultiChart(config: ChartConfig): string {
    const { data, xColumn, yColumn, title } = config;

    const notebook = {
      cells: [
        this.createMarkdownCell(`# ${title} - Analyse complète`),
        this.createMarkdownCell(
          `Généré le ${new Date().toLocaleString("fr-FR")}\n\n` +
            `Ce notebook contient plusieurs visualisations des mêmes données.`
        ),
        this.createCodeCell(this.generateImports()),
        this.createCodeCell(this.generateDataFrame(data)),

        this.createMarkdownCell("## 📊 Statistiques descriptives"),
        this.createCodeCell(this.generateStatistics()),

        this.createMarkdownCell("## 📈 Graphique en ligne"),
        this.createCodeCell(this.generatePlot("line", xColumn, yColumn, title)),

        this.createMarkdownCell("## 📊 Graphique en barres"),
        this.createCodeCell(this.generatePlot("bar", xColumn, yColumn, title)),

        this.createMarkdownCell("## 🎨 Graphique interactif (Plotly)"),
        this.createCodeCell(
          this.generateInteractivePlot("line", xColumn, yColumn, title)
        ),

        this.createMarkdownCell("## 📉 Analyse de distribution"),
        this.createCodeCell(`# Distribution des valeurs
plt.figure(figsize=(12, 5))

plt.subplot(1, 2, 1)
plt.hist(df['${yColumn}'], bins=20, color='steelblue', alpha=0.7, edgecolor='black')
plt.title('Distribution de ${yColumn}')
plt.xlabel('${yColumn}')
plt.ylabel('Fréquence')
plt.grid(True, alpha=0.3)

plt.subplot(1, 2, 2)
plt.boxplot(df['${yColumn}'], vert=True)
plt.title('Box plot de ${yColumn}')
plt.ylabel('${yColumn}')
plt.grid(True, alpha=0.3)

plt.tight_layout()
plt.show()`),

        this.createMarkdownCell("## 📋 Tableau de données complet"),
        this.createCodeCell("df"),

        this.createMarkdownCell("## 💾 Export des données"),
        this.createCodeCell(`# Sauvegarder en CSV
df.to_csv('data_export.csv', index=False)
print("✅ Données exportées vers data_export.csv")

# Sauvegarder en Excel
df.to_excel('data_export.xlsx', index=False)
print("✅ Données exportées vers data_export.xlsx")`),
      ],
      metadata: {
        kernelspec: {
          display_name: "Python 3",
          language: "python",
          name: "python3",
        },
        language_info: {
          name: "python",
          version: "3.11.0",
          mimetype: "text/x-python",
          codemirror_mode: {
            name: "ipython",
            version: 3,
          },
          pygments_lexer: "ipython3",
          nbconvert_exporter: "python",
          file_extension: ".py",
        },
      },
      nbformat: 4,
      nbformat_minor: 5,
    };

    return JSON.stringify(notebook, null, 2);
  }
}
