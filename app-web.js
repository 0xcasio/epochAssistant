// app-web.js - Modified version of your original app with a web interface
const ethers = require('ethers');
const fs = require('fs');
const axios = require('axios');
const http = require('http');
const path = require('path');
require('dotenv').config();

// Configuration - same as your original app
const config = {
  rpcUrl: process.env.RPC_URL || 'https://arb1.arbitrum.io/rpc',
  contractAddress: process.env.CONTRACT_ADDRESS || '',
  arbiscanApiKey: process.env.ARBISCAN_API_KEY || '',  // Optional, for higher rate limits
  contractAbi: [],  // Will be fetched automatically
  selectedFunction: null,  // Will be set by user selection
  outputFilePath: process.env.OUTPUT_FILE_PATH || './results.csv',
  // Predefined values for pool IDs (bytes32 values)
  predefinedInputs: {
    poolIds: process.env.POOL_IDS ? process.env.POOL_IDS.split(',').map(v => v.trim()) : [
      "0x02d1dc927ecebd87407e1a58a6f2d81f0d6c0ade72ac926e865310aa482b893a", 
      "0x726dd6a67a7c5b399e0e6954596d6b01605ec97e34e75f5547416146ec001a6c",
      "0x74b6b9b1267a0a12d24cfa963f1a3c96aae2f2cd870847cbc9a70c46b7803ae1",
      "0xbb8c79b0fc39426b2cf4bb42501aaa2bdcc7a72f86a564d44a42c6385496618d",
      "0x36ff4f3050b6a776353d7d160276dcf6b310a658502e226fdd2fa049e6c603dd"
    ],
    poolNames: [
      "PancankeSwap WETH",
      "PancakeSwap WBTC", 
      "OrangeFinance PCS WETH", 
      "OrangeFinance PCS WBTC", 
      "OrangeFinance PCS ARB"
    ]
  }
};

// ---- Core Functions from Your Original App ----

// Fetch contract ABI from Arbiscan
async function fetchContractAbi() {
  try {
    console.log('📡 Fetching contract ABI from Arbiscan...');
    
    // Arbiscan API URL
    const apiUrl = 'https://api.arbiscan.io/api';
    const apiParams = {
      module: 'contract',
      action: 'getabi',
      address: config.contractAddress,
      apikey: config.arbiscanApiKey || ''
    };
    
    // Format URL with parameters
    const queryString = Object.entries(apiParams)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    const url = `${apiUrl}?${queryString}`;
    
    // Make API request
    const response = await axios.get(url);
    
    if (response.data.status === '1' && response.data.message === 'OK') {
      const abi = JSON.parse(response.data.result);
      config.contractAbi = abi;
      
      // Save ABI to file for future use
      fs.writeFileSync('contract-abi.json', JSON.stringify(abi, null, 2));
      console.log('✅ Contract ABI fetched successfully!');
      return true;
    } else {
      console.log(`❌ Failed to fetch ABI: ${response.data.message}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error fetching ABI: ${error.message}`);
    return false;
  }
}

// Process function call for all pool IDs
async function processAllPoolIds(input2Value) {
  if (!config.selectedFunction) {
    return { success: false, error: 'No function selected' };
  }
  
  const results = [];
  console.log(`\nProcessing ${config.predefinedInputs.poolIds.length} predefined pool IDs with input2 = ${input2Value}...`);
  
  // Format input2
  const formattedInput2 = ethers.BigNumber.from(input2Value);
  
  // Set up provider and contract
  const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
  const contract = new ethers.Contract(
    config.contractAddress,
    config.contractAbi,
    provider
  );
  
  // Process each predefined pool ID with the same input2
  for (let i = 0; i < config.predefinedInputs.poolIds.length; i++) {
    const poolId = config.predefinedInputs.poolIds[i];
    const poolName = config.predefinedInputs.poolNames[i] || `Pool ${i + 1}`;
    
    console.log(`\n[${i+1}/${config.predefinedInputs.poolIds.length}] Processing ${poolName} with bytes32 ID: ${poolId}`);
    
    try {
      // Call the function with the two inputs
      const result = await contract[config.selectedFunction.name](poolId, formattedInput2);
      
      // Format the result
      let formattedResult;
      if (Array.isArray(result)) {
        formattedResult = result.map(r => r.toString()).join(', ');
      } else {
        formattedResult = result.toString();
      }
      
      console.log(`✅ Result: ${formattedResult}`);
      
      // Create formatted value (divided by 1e18)
      let formattedValue = "N/A";
      try {
        if (!isNaN(formattedResult.replace(/,/g, ''))) {
          const numericResult = parseFloat(formattedResult.replace(/,/g, ''));
          formattedValue = (numericResult / 1e18).toString();
          // Format with 6 decimal places
          if (formattedValue.includes('.')) {
            const parts = formattedValue.split('.');
            if (parts[1].length > 6) {
              formattedValue = `${parts[0]}.${parts[1].substring(0, 6)}`;
            }
          }
        }
      } catch (error) {
        console.log('Could not format result as number divided by 1e18');
      }
      
      // Save result to CSV
      saveToFile([poolId, formattedInput2], formattedResult, poolName);
      
      results.push({ 
        poolName, 
        poolId, 
        result: formattedResult,
        formattedValue,
        error: null 
      });
    } catch (error) {
      console.error(`❌ Error processing ${poolName}: ${error.message}`);
      results.push({ 
        poolName, 
        poolId, 
        result: null,
        formattedValue: null,
        error: error.message 
      });
    }
  }
  
  // Show summary
  console.log('\n===== PROCESSING SUMMARY =====');
  console.log(`Total pools processed: ${results.length}`);
  console.log(`Successful: ${results.filter(r => r.error === null).length}`);
  console.log(`Failed: ${results.filter(r => r.error !== null).length}`);
  
  return { success: true, results };
}

// Function to save results to a file (from your original app)
function saveToFile(inputs, result, poolName = null) {
  const timestamp = new Date().toISOString();
  
  // Create formatted result (divided by 1e18)
  let formattedResult = "N/A";
  try {
    // Check if the result is a number or can be converted to one
    if (!isNaN(result.replace(/,/g, ''))) {
      const numericResult = parseFloat(result.replace(/,/g, ''));
      formattedResult = (numericResult / 1e18).toString();
      // Format with 6 decimal places
      if (formattedResult.includes('.')) {
        const parts = formattedResult.split('.');
        if (parts[1].length > 6) {
          formattedResult = `${parts[0]}.${parts[1].substring(0, 6)}`;
        }
      }
    }
  } catch (error) {
    console.log('Could not format result as number divided by 1e18');
  }
  
  // Check if file exists
  if (fs.existsSync(config.outputFilePath)) {
    // Read the first line to check headers
    const fileContent = fs.readFileSync(config.outputFilePath, 'utf8');
    const lines = fileContent.split('\n');
    
    if (lines.length > 0) {
      const headers = lines[0];
      
      // Check if necessary columns exist
      const needsUpdate = !headers.includes('FormattedResult') || !headers.includes('PoolName');
      
      if (needsUpdate) {
        console.log('Updating CSV file to include all required columns...');
        
        // Create a new file with updated headers and copy existing data
        const newContent = lines.map((line, index) => {
          if (index === 0) {
            // Update header line
            if (!headers.includes('FormattedResult') && !headers.includes('PoolName')) {
              return `${line},FormattedResult,PoolName`;
            } else if (!headers.includes('FormattedResult')) {
              return `${line},FormattedResult`;
            } else if (!headers.includes('PoolName')) {
              return `${line},PoolName`;
            }
            return line;
          } else if (line.trim() !== '') {
            // Add placeholder values to existing data rows
            if (!headers.includes('FormattedResult') && !headers.includes('PoolName')) {
              return `${line},N/A,Unknown`;
            } else if (!headers.includes('FormattedResult')) {
              return `${line},N/A`;
            } else if (!headers.includes('PoolName')) {
              return `${line},Unknown`;
            }
            return line;
          }
          return line;
        }).join('\n');
        
        fs.writeFileSync(config.outputFilePath, newContent);
        console.log('CSV file updated with new columns.');
      }
    }
  } else {
    // Create new file with headers
    const headers = `Timestamp,Function,Input1,Input2,Result,FormattedResult,PoolName\n`;
    fs.writeFileSync(config.outputFilePath, headers);
    console.log(`Created new CSV file with headers`);
  }
  
  // Format the CSV line
  const functionName = config.selectedFunction ? config.selectedFunction.name : "callFunction";
  const inputValues = inputs.join(',');
  const poolNameStr = poolName || "Unknown";
  const csvLine = `${timestamp},${functionName},${inputValues},${result},${formattedResult},${poolNameStr}\n`;
  
  // Append data
  fs.appendFileSync(config.outputFilePath, csvLine);
  console.log(`📝 Result saved to ${config.outputFilePath}`);
}

// ---- Simple Web Server ----

// Create a basic HTML file
const indexHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Epoch Rewards Lookup | Stryke</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        h1 {
            text-align: center;
            margin-bottom: 20px;
        }
        .container {
            background-color: #f9f9f9;
            border-radius: 5px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        input, select {
            width: 100%;
            padding: 8px;
            margin-bottom: 20px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
        }
        button {
            background-color: #4CAF50;
            color: white;
            padding: 10px 15px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }
        button:hover {
            background-color: #45a049;
        }
        button:disabled {
            background-color: #cccccc;
            cursor: not-allowed;
        }
        .results {
            margin-top: 30px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        th, td {
            text-align: left;
            padding: 12px;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #f2f2f2;
        }
        tr:hover {
            background-color: #f5f5f5;
        }
        .error {
            color: #ff0000;
            background-color: #ffeeee;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
        }
        .success {
            color: #008000;
            background-color: #eeffee;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
        }
        .loading {
            text-align: center;
            margin: 20px 0;
        }
        .hidden {
            display: none;
        }
    </style>
</head>
<body>
    <h1>Epoch Rewards Lookup</h1>
    
    <div class="container">
        <div id="errorMsg" class="error hidden"></div>
        <div id="successMsg" class="success hidden"></div>
        
        <div id="contractForm">
            <div id="functionSelectContainer">
                <label for="functionSelect">Select Function:</label>
                <select id="functionSelect">
                    <option value="">Loading functions...</option>
                </select>
            </div>
            
            <div id="inputContainer">
                <label for="input2Value">Enter Epoch number:</label>
                <input type="text" id="input2Value" placeholder="Enter epoch number...">
            </div>
            
            <button id="submitBtn" onclick="callFunction()">Find Rewards</button>
        </div>
        
        <div id="loading" class="loading hidden">
            Processing... Please wait...
        </div>
        
        <div id="results" class="results hidden">
            <h2>Results</h2>
            <table id="resultsTable">
                <thead>
                    <tr>
                        <th>Pool Name</th>
                        <th>Total SYK rewards</th>
                    </tr>
                </thead>
                <tbody id="resultsBody">
                </tbody>
            </table>
        </div>
    </div>

    <script>
        // Initialize when page loads
        window.onload = function() {
            fetchFunctions();
        };
        
        // Fetch available functions from server
        async function fetchFunctions() {
            try {
                const response = await fetch('/api/functions');
                const data = await response.json();
                
                if (data.success) {
                    const select = document.getElementById('functionSelect');
                    select.innerHTML = '<option value="">Select a function...</option>';
                    
                    data.functions.forEach(func => {
                        // Find only functions with 2 inputs that match our pattern
                        if (func.inputs && 
                            func.inputs.length === 2 &&
                            func.inputs[0].type.includes('bytes') &&
                            func.inputs[1].type.includes('int')
                        ) {
                            const option = document.createElement('option');
                            option.value = func.name;
                            option.textContent = func.name + ' (' + func.inputs[1].type + ')';
                            
                            // Set computeRewards as the default selected option
                            if (func.name === 'computeRewards') {
                                option.selected = true;
                            }
                            
                            select.appendChild(option);
                        }
                    });
                    
                    if (select.options.length <= 1) {
                        showError('No suitable functions found. Functions should have bytes32 and uint256 inputs.');
                    }
                } else {
                    showError(data.error || 'Failed to load functions');
                }
            } catch (error) {
                showError('Error connecting to server: ' + error.message);
            }
        }
        
        // Call the selected function with input value
        async function callFunction() {
            // Get input values
            const functionName = document.getElementById('functionSelect').value;
            const input2Value = document.getElementById('input2Value').value;
            
            // Validate inputs
            if (!functionName) {
                showError('Please select a function');
                return;
            }
            
            if (!input2Value) {
                showError('Please enter an input value');
                return;
            }
            
            if (isNaN(input2Value)) {
                showError('Input value must be a number');
                return;
            }
            
            // Clear previous messages and results
            clearMessages();
            document.getElementById('results').classList.add('hidden');
            
            // Show loading state
            document.getElementById('loading').classList.remove('hidden');
            document.getElementById('submitBtn').disabled = true;
            
            try {
                const response = await fetch('/api/call-function', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        functionName,
                        input2Value
                    })
                });
                
                const data = await response.json();
                
                // Hide loading state
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('submitBtn').disabled = false;
                
                if (data.success) {
                    displayResults(data.results);
                    showSuccess('Successfully fetched epoch!');
                } else {
                    showError(data.error || 'Failed to call function');
                }
            } catch (error) {
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('submitBtn').disabled = false;
                showError('Error: ' + error.message);
            }
        }
        
        // Display results in the table
        function displayResults(results) {
            const tbody = document.getElementById('resultsBody');
            tbody.innerHTML = '';
            
            results.forEach(result => {
                const row = document.createElement('tr');
                
                // Pool name cell
                const nameCell = document.createElement('td');
                nameCell.textContent = result.poolName;
                row.appendChild(nameCell);
                
                // Formatted result cell
                const formattedCell = document.createElement('td');
                if (result.error) {
                    formattedCell.textContent = 'N/A';
                } else {
                    formattedCell.textContent = result.formattedValue;
                }
                row.appendChild(formattedCell);
                
                tbody.appendChild(row);
            });
            
            document.getElementById('results').classList.remove('hidden');
        }
        
        // Show error message
        function showError(message) {
            const errorMsg = document.getElementById('errorMsg');
            errorMsg.textContent = message;
            errorMsg.classList.remove('hidden');
        }
        
        // Show success message
        function showSuccess(message) {
            const successMsg = document.getElementById('successMsg');
            successMsg.textContent = message;
            successMsg.classList.remove('hidden');
        }
        
        // Clear messages
        function clearMessages() {
            document.getElementById('errorMsg').classList.add('hidden');
            document.getElementById('successMsg').classList.add('hidden');
        }
    </script>
</body>
</html>
`;

// Create HTTP server
const server = http.createServer(async (req, res) => {
  try {
    // Parse URL
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    
    // Log incoming requests
    console.log(`${req.method} ${pathname}`);
    
    // Route requests
    if (req.method === 'GET' && pathname === '/') {
      // Serve main HTML page
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(indexHtml);
    }
    else if (req.method === 'GET' && pathname === '/api/functions') {
      // Get contract functions
      if (!config.contractAbi || config.contractAbi.length === 0) {
        // Try to load ABI from file
        try {
          if (fs.existsSync('contract-abi.json')) {
            const abiJson = fs.readFileSync('contract-abi.json', 'utf8');
            config.contractAbi = JSON.parse(abiJson);
          } else {
            // Fetch ABI if not available
            await fetchContractAbi();
          }
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Error loading ABI: ' + error.message }));
          return;
        }
      }
      
      // Filter to only show read functions
      const readFunctions = config.contractAbi.filter(item => 
        item.type === 'function' && 
        (item.stateMutability === 'view' || item.stateMutability === 'pure')
      );
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, functions: readFunctions }));
    }
    else if (req.method === 'POST' && pathname === '/api/call-function') {
      // Call function with all pool IDs
      let body = '';
      
      // Collect request body
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      // Process request when complete
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const { functionName, input2Value } = data;
          
          if (!functionName) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Function name is required' }));
            return;
          }
          
          if (!input2Value && input2Value !== '0') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Input value is required' }));
            return;
          }
          
          // Find function in ABI
          config.selectedFunction = config.contractAbi.find(item => item.name === functionName);
          
          if (!config.selectedFunction) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: `Function ${functionName} not found in ABI` }));
            return;
          }
          
          // Process all pool IDs
          const result = await processAllPoolIds(input2Value);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
    }
    else {
      // Not found
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  } catch (error) {
    // Server error
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error: ' + error.message);
  }
});

// Check configuration and start server
async function startServer() {
  // Make sure we have a contract address
  if (!config.contractAddress) {
    console.log('\n⚠️ No contract address configured. Please set CONTRACT_ADDRESS in .env file');
    process.exit(1);
  }
  
  // Try to load ABI or fetch it
  try {
    if (fs.existsSync('contract-abi.json')) {
      const abiJson = fs.readFileSync('contract-abi.json', 'utf8');
      config.contractAbi = JSON.parse(abiJson);
      console.log('✅ Loaded ABI from file');
    } else {
      console.log('⚠️ No ABI file found, will fetch from Arbiscan on first request');
    }
  } catch (error) {
    console.log('⚠️ Error loading ABI file: ' + error.message);
  }
  
  // Start HTTP server
  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`\n✅ Server running at http://localhost:${port}`);
    console.log(`\nOpen your browser to this address to use the web interface`);
  });
}

// Start server
startServer();