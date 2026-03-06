# 🌐 NetDiagram — Network Diagram Automation

A full-stack web application that parses device configurations (Cisco, Palo Alto, Excel), builds a device graph, ingests traffic logs, aggregates them into flow records, and provides an interactive Cytoscape.js network diagram with flexible filtering.

---

## 📋 Features

- **Config Parsing**: Cisco IOS/IOS-XE (text), Palo Alto (XML/JSON), Excel template
- **Traffic Log Ingestion**: CSV/Excel logs with user-defined column mapping
- **Flow Aggregation**: Deduplication by 5-tuple (srcIP, dstIP, srcPort, dstPort, protocol) with occurrence counting
- **Flow-to-Device Correlation**: Longest-prefix-match on interface subnets
- **Interactive Diagram**: Cytoscape.js with multiple layouts, click-to-inspect nodes, edge labels with flow counts
- **Filter Panel**: Filter by IP, protocol, port, zone, interface, min occurrences
- **Dark UI**: Clean dark-themed React interface

---

## 🏗️ Architecture

```
netdiagram/
├── backend/           # NestJS + TypeScript + TypeORM + PostgreSQL
│   ├── src/
│   │   ├── entities/  # TypeORM database entities
│   │   ├── parsers/   # Cisco, PaloAlto, Excel parsers
│   │   ├── flows/     # Traffic log ingestion + correlation
│   │   ├── graph/     # Graph building + REST API
│   │   ├── upload/    # File upload endpoint + job management
│   │   └── jobs/      # Background job tracking
│   └── Dockerfile
├── frontend/          # React + TypeScript + Vite + Cytoscape.js
│   ├── src/
│   │   ├── pages/     # UploadPage, DiagramPage
│   │   ├── api/       # Axios API client
│   │   └── types/     # Shared TypeScript interfaces
│   └── Dockerfile
├── examples/          # Sample input files for testing
├── docker-compose.yml
└── README.md
```

---

## 🚀 Running Locally (without Docker)

All commands below are run in a **bash/zsh terminal** (macOS Terminal, iTerm2, or the VS Code integrated terminal).

### Prerequisites

- **Node.js 20+** — already installed via nvm on this machine. To verify: `node --version`
- **PostgreSQL 15+** — must be installed and running locally

> **Note for this machine:** Node.js was installed with nvm. Each new terminal session must load nvm first:
> ```bash
> export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
> ```
> Or add those two lines to your `~/.zshrc` or `~/.bash_profile` so they load automatically.

---

### Step 1 — Set up PostgreSQL

Open a terminal and run (from **any** directory):

```bash
# Create the database
createdb netdiagram
```

If `createdb` is not in your PATH, try:
```bash
/usr/local/bin/createdb netdiagram
# or
psql -c "CREATE DATABASE netdiagram;"
```

---

### Step 2 — Configure the Backend

Open a terminal and navigate to the **backend** folder:

```bash
cd /Users/audreymorgan/Projects/netdiagram/backend
```

Copy the environment template and fill in your PostgreSQL credentials:

```bash
cp .env.example .env
```

Open `.env` in any text editor and set:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=<your postgres username>    # e.g. audreymorgan or postgres
DB_PASSWORD=<your postgres password>    # leave blank if no password set
DB_NAME=netdiagram
PORT=3000
NODE_ENV=development
```

---

### Step 3 — Start the Backend

Still inside `/Users/audreymorgan/Projects/netdiagram/backend`, run:

```bash
# Load nvm (required each new terminal session unless added to shell profile)
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"

# Run database migrations (creates all tables automatically)
npm run migration:run

# Start the development server (stays running — leave this terminal open)
npm run start:dev
```

You should see:
```
[NestApplication] Nest application successfully started
[Main] NetDiagram backend listening on port 3000
```

The backend API is now available at **http://localhost:3000**

---

### Step 4 — Start the Frontend

Open a **second, new terminal** and run:

```bash
# Load nvm
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"

# Navigate to the frontend folder
cd /Users/audreymorgan/Projects/netdiagram/frontend

# Start the Vite development server (leave this terminal open)
npm run dev
```

You should see:
```
  VITE v5.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

---

### Step 5 — Open the Application

Open your browser and navigate to:

**http://localhost:5173**

You'll see the NetDiagram upload page. Upload any files from the `examples/` folder to test.


---

## 🐳 Running with Docker

```bash
cd netdiagram

# Start all services (PostgreSQL + Backend + Frontend)
docker-compose up --build

# → Frontend: http://localhost:5173
# → Backend API: http://localhost:3000
```

---

## 📖 Usage Guide

### Step 1: Upload Files

1. Open http://localhost:5173
2. Drag & drop one or more files onto the upload area:
   - **Cisco configs**: `.txt`, `.cfg`, `.conf`, `.ios`
   - **Palo Alto configs**: `.xml`, `.json`
   - **Excel templates**: `.xlsx`
   - **Traffic logs**: `.csv`, `.tsv`
3. Each file badge shows its detected type (click to toggle between `config` and `log`)
4. For traffic log files, fill in the **Column Mapping** form to specify your CSV column names
5. Click **🚀 Upload & Build Diagram**
6. A progress bar will track processing. When complete, you are redirected to the diagram page.

### Step 2: Explore the Diagram

- **Click a node** to see device details (vendor, interfaces, IPs, zones)
- Use the **Layout** dropdown to switch between: `cose-bilkent`, `cose`, `grid`, `circle`, `breadthfirst`, `concentric`
- Use **Zoom controls** (bottom-right) to zoom in/out and fit

### Step 3: Filter Traffic Flows

Use the left panel to filter the diagram:

| Filter | Description |
|--------|-------------|
| IP Address | Show only devices involved in flows from/to this IP |
| Protocol | Filter by TCP, UDP, ICMP, etc. |
| Destination Port | Filter by port number |
| Zone | Filter to devices in a specific firewall zone |
| Min Occurrences | Slider to exclude low-frequency flows |
| Show all edges | Toggle to include all device connections, not just flow-carrying ones |

Click **Apply** to update the diagram, **Reset** to restore the full graph.

Edge labels show: `1.2k flows (TCP/443, UDP/53)`

---

## 📁 Example Files

Located in `examples/`:

| File | Description |
|------|-------------|
| `cisco-sample.txt` | Cisco IOS router config with interfaces, OSPF, static routes |
| `paloalto-sample.xml` | Palo Alto XML config with zones and sub-interfaces |
| `traffic-log-sample.csv` | Sample traffic log (use column mapping: `src_ip`, `dst_ip`, `src_port`, `dst_port`, `proto`, `timestamp`) |

### Excel Template Format

Create an `.xlsx` file with these sheets:

**Devices** (sheet 1):
| hostname | vendor | model | properties |
|----------|--------|-------|-----------|
| Router-1 | cisco | ASR1001 | {} |

**Interfaces** (sheet 2):
| hostname | interfaceName | ips | speed | vlan | zone | description |
|----------|---------------|-----|-------|------|------|-------------|
| Router-1 | GigE0/0 | 10.0.0.1/30 | 1G | | | WAN Link |

**VLANs** (sheet 3):
| id | name | subnet |
|----|------|--------|
| 100 | DMZ | 172.16.0.0/24 |

**Connections** (sheet 4):
| sourceHostname | sourceInterface | targetHostname | targetInterface | vlan | speed |
|----------------|----------------|----------------|-----------------|------|-------|
| Router-1 | GigE0/1 | Switch-1 | Gi1/0/1 | | 1G |

---

## 🔌 REST API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/upload` | Upload files. Body: `multipart/form-data` with `files[]`, optional `columnMapping` (JSON), `fileTypes` (JSON) |
| `GET` | `/status/:jobId` | Poll job status. Returns `{ id, status, progress, message }` |
| `GET` | `/graph` | Get the full device graph |
| `POST` | `/graph/filter` | Get a filtered subgraph. Body: `FilterCriteria` JSON |

### FilterCriteria Schema

```json
{
  "ip": "10.0.1.1",
  "protocol": "TCP",
  "port": 443,
  "zone": "trust",
  "interface": "GigE",
  "minOccurrences": 5,
  "showAllEdges": false
}
```

---

## 🗄️ Database Schema

| Table | Description |
|-------|-------------|
| `device` | Parsed devices (hostname, vendor, model) |
| `interface` | Device interfaces with IPs, zones, VLANs |
| `connection` | Edges between devices (inferred from IP or explicit from Excel) |
| `flow_record` | Aggregated traffic flows (5-tuple + occurrence count) |
| `vlan` | Optional VLAN reference table |

Connections are inferred automatically when two interfaces share an IP subnet (longest-prefix match), or defined explicitly via the Excel Connections sheet.

---

## ⚙️ Environment Variables

```env
# backend/.env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=netdiagram
PORT=3000
NODE_ENV=development
UPLOAD_DEST=./uploads
MAX_FILE_SIZE_MB=100
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## 📝 License

MIT
