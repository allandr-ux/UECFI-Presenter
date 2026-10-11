/**
 * Remote Web Server for UECFI Presenter
 * 
 * Provides an HTTP server for remote presentation control (mobile/browser controllers).
 * In Electron/Node.js environments, this runs via Node's native 'http' module.
 * In purely static web browser hosting, it gracefully alerts that remote listening requires desktop runtime.
 */
function vvWebServer() {
  this.init = startOrStopServer;
  this.remoteVVStatus = isServerRunning;

  let serverInstance = null;
  let port = 50000;
  let bindHost = "0.0.0.0";
  let isRunning = false;
  let canProcessCommand = true;

  function isServerRunning() {
    return isRunning;
  }

  function startOrStopServer(targetPort, targetHost) {
    if (targetPort) port = parseInt(targetPort, 10);
    if (targetHost) bindHost = targetHost;

    if (!isRunning) {
      if (typeof require !== "function") {
        alert("Remote Web Server requires desktop runtime or backend socket support (not available in client-only browser hosting).");
        return false;
      }

      try {
        const http = require("http");
        const fs = require("fs");
        const path = require("path");

        serverInstance = http.createServer((req, res) => {
          try {
            const reqUrl = req.url || "/";

            // Check if this is an API command request
            if (reqUrl.includes("test.txt") || reqUrl.includes("command=")) {
              // Parse command and value parameters
              const urlParts = reqUrl.split("?");
              const queryString = urlParts[1] || "";
              const params = new URLSearchParams(queryString.replace(/\?/g, "&"));

              const command = params.get("command") || "";
              let value = params.get("value") || "";
              value = decodeURIComponent(value);

              let responseText = "";

              if (canProcessCommand) {
                canProcessCommand = false;
                setTimeout(() => { canProcessCommand = true; }, 400);

                switch (command) {
                  case "1": { // Present Bible Reference
                    if (typeof bibleRefObj !== "undefined" && bibleRefObj) {
                      const success = bibleRefObj.init(value);
                      if (success) {
                        bibleRefObj.present();
                        responseText = "OK: Presenting " + value;
                      } else {
                        responseText = bibleRefObj.getErrorMessage ? bibleRefObj.getErrorMessage() : "Invalid Bible Reference";
                      }
                    }
                    break;
                  }
                  case "2": // Next Slide
                    if (typeof call_nextSlide === "function") call_nextSlide();
                    responseText = "OK: Next Slide";
                    break;
                  case "3": // Previous Slide
                    if (typeof call_prevSlide === "function") call_prevSlide();
                    responseText = "OK: Previous Slide";
                    break;
                  case "4": // Close / Blank Presentation
                    if (typeof call_closePresentation === "function") call_closePresentation();
                    responseText = "OK: Closed Presentation";
                    break;
                  case "5": // Get Recent
                    if (typeof recent !== "undefined" && recent && typeof recent.data2string === "function") {
                      responseText = recent.data2string();
                    }
                    break;
                  case "6": // Get Schedule Text
                    if (typeof scheduleObj !== "undefined" && scheduleObj && typeof scheduleObj.getScheduleText === "function") {
                      responseText = scheduleObj.getScheduleText();
                    }
                    break;
                  case "7": // Present Schedule Item
                    if (typeof scheduleObj !== "undefined" && scheduleObj && typeof scheduleObj.processRemotePresent === "function") {
                      scheduleObj.processRemotePresent(value);
                      responseText = "OK: Present Schedule " + value;
                    }
                    break;
                  default:
                    responseText = "Unknown Command";
                    break;
                }
              }

              res.writeHead(200, {
                "Content-Type": "text/plain; charset=utf-8",
                "Access-Control-Allow-Origin": "*"
              });
              res.end(responseText);
              return;
            }

            // Serve remote controller HTML page (network/remotexml2.html)
            const htmlPath = path.join(__dirname, "network", "remotexml2.html");
            if (fs.existsSync(htmlPath)) {
              const htmlContent = fs.readFileSync(htmlPath, "utf8");
              res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
              res.end(htmlContent);
            } else {
              res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
              res.end("<h1>UECFI Remote Controller</h1><p>Active</p>");
            }
          } catch (handlerErr) {
            console.error("[HTTP SERVER] Request handling error:", handlerErr);
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Server Error");
          }
        });

        serverInstance.on("error", (err) => {
          console.error("[HTTP SERVER] Server error:", err);
          isRunning = false;
          alert("Remote server error: " + err.message);
        });

        serverInstance.listen(port, bindHost, () => {
          isRunning = true;
          console.log(`[HTTP SERVER] UECFI Presenter Remote listening on http://${bindHost}:${port}/`);
        });

        isRunning = true;
        return true;
      } catch (err) {
        console.error("[HTTP SERVER] Start failure:", err);
        alert("Remote UECFI Presenter failed to start: " + err.message);
        return false;
      }
    } else {
      // Stop server
      if (serverInstance) {
        try {
          serverInstance.close();
        } catch(e) {}
        serverInstance = null;
      }
      isRunning = false;
      return true;
    }
  }
}