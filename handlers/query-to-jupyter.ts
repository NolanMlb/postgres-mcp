import { writeFileSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { Logger } from "../utils/logger.js";
import { SQLValidator } from "../validators/sql-validator.js";
import { JupyterGenerator } from "../utils/jupyter-generator.js";

const execAsync = promisify(exec);

const JupyterInputSchema = z.object({
  query: z.string().min(1, "Query cannot be empty"),
  chartType: z.enum(["line", "bar", "pie", "area", "scatter", "multi"]),
  xColumn: z.string().min(1, "X column cannot be empty"),
  yColumn: z.string().min(1, "Y column cannot be empty"),
  title: z.string().optional(),
  filename: z.string().optional(),
});

export class QueryToJupyterHandler {
  constructor(
    private readonly validator: SQLValidator,
    private readonly executeQuery: (query: string) => Promise<any[]>,
    private readonly allowWriteOps: boolean
  ) {}

  async handle(args: any) {
    const { query, chartType, xColumn, yColumn, title, filename } =
      JupyterInputSchema.parse(args);

    Logger.info("Executing query for Jupyter notebook", {
      query: query.substring(0, 200),
      chartType,
    });

    // Validate query
    const validation = this.validator.validate(query);
    if (!validation.isValid) {
      throw new Error(validation.error || "Query validation failed");
    }

    // Add LIMIT if needed
    let finalQuery = query;
    if (
      !this.allowWriteOps ||
      query.trim().toUpperCase().startsWith("SELECT")
    ) {
      finalQuery = this.validator.addLimitIfNeeded(query);
    }

    const startTime = Date.now();
    try {
      const result = await this.executeQuery(finalQuery);
      const duration = Date.now() - startTime;

      Logger.info("Query executed successfully for Jupyter", {
        duration: `${duration}ms`,
        rowCount: result.length,
      });

      // Validate columns
      this.validator.validateColumns(result, xColumn, yColumn);

      // Generate Jupyter notebook
      const notebookContent =
        chartType === "multi"
          ? JupyterGenerator.generateMultiChart({
              data: result,
              chartType: "line",
              xColumn,
              yColumn,
              title: title || "Analyse de données PostgreSQL",
            })
          : JupyterGenerator.generate({
              data: result,
              chartType,
              xColumn,
              yColumn,
              title: title || "Visualisation de données PostgreSQL",
            });

      // Generate filename
      const sanitizedTitle = (title || "analysis")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

      const notebookFilename =
        filename || `${sanitizedTitle}_${Date.now()}.ipynb`;
      const notebookPath = join(process.cwd(), notebookFilename);

      // Write the notebook file
      writeFileSync(notebookPath, notebookContent, "utf8");
      Logger.info("Notebook file created", { path: notebookPath });

      // Try to open the notebook
      let openCommand = "";
      let openMethod = "";

      // Detect OS and use appropriate command
      if (process.platform === "darwin") {
        // macOS - try to open with Cursor/VS Code first, then default app
        openCommand = `code "${notebookPath}" || open "${notebookPath}"`;
        openMethod = "Cursor/VS Code ou application par défaut";
      } else if (process.platform === "win32") {
        // Windows
        openCommand = `code "${notebookPath}" || start "" "${notebookPath}"`;
        openMethod = "Cursor/VS Code ou application par défaut";
      } else {
        // Linux
        openCommand = `code "${notebookPath}" || xdg-open "${notebookPath}"`;
        openMethod = "Cursor/VS Code ou application par défaut";
      }

      // Execute open command
      try {
        await execAsync(openCommand);
        Logger.info("Notebook opened successfully", { method: openMethod });
      } catch (error: any) {
        Logger.warn("Could not open notebook automatically", {
          error: error.message,
        });
      }

      return {
        content: [
          {
            type: "text",
            text:
              `# 📓 Notebook Jupyter créé et ouvert !\n\n` +
              `✅ **Fichier créé:** \`${notebookPath}\`\n` +
              `✅ **Ouverture:** ${openMethod}\n\n` +
              `## 📊 Détails\n\n` +
              `- **Lignes:** ${result.length}\n` +
              `- **Type de graphique:** ${chartType}\n` +
              `- **Axe X:** ${xColumn}\n` +
              `- **Axe Y:** ${yColumn}\n` +
              `- **Titre:** ${
                title || "Visualisation de données PostgreSQL"
              }\n\n` +
              `## 🚀 Prochaines étapes\n\n` +
              `Le notebook devrait s'ouvrir automatiquement dans Cursor/VS Code.\n\n` +
              `**Si ce n'est pas le cas:**\n` +
              `1. Ouvrez manuellement le fichier: \`${notebookFilename}\`\n` +
              `2. Sélectionnez le kernel Python (en haut à droite)\n` +
              `3. Exécutez les cellules avec \`Shift+Enter\`\n\n` +
              `## 📦 Dépendances Python requises\n\n` +
              `Si vous n'avez pas encore installé les bibliothèques:\n\n` +
              `\`\`\`bash\n` +
              `pip install pandas matplotlib seaborn plotly jupyter ipykernel\n` +
              `\`\`\`\n\n` +
              `## 💡 Astuces\n\n` +
              `- **Exécuter toutes les cellules:** Cliquez sur "Run All" en haut\n` +
              `- **Modifier le code:** Éditez directement les cellules Python\n` +
              `- **Ajouter des analyses:** Insérez de nouvelles cellules avec le bouton +\n` +
              `- **Exporter en HTML:** File → Export → HTML\n` +
              `- **Sauvegarder:** Le fichier est déjà sauvegardé, vos modifications seront auto-sauvegardées`,
          },
        ],
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      Logger.error("Jupyter notebook generation failed", {
        error: error.message,
        duration: `${duration}ms`,
      });
      throw error;
    }
  }
}
