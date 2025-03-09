// app-web.js - Modified version of your original app with a web interface
const { ethers } = require('ethers');
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
  contractAbi: require('./contract-abi.json'),
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
  // If ABI is already hardcoded, just return
  if (config.contractAbi && config.contractAbi.length > 0) {
    console.log('✅ Using hardcoded ABI');
    return true;
  }
  
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
      console.log(`Found ${abi.length} items in ABI`);
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
  console.log(`Function name: ${config.selectedFunction.name}`);
  
  // Format input2
  const formattedInput2 = ethers.getBigInt(input2Value);
  
  // Set up provider and contract
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
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
      console.log(`Calling ${config.selectedFunction.name}(${poolId}, ${formattedInput2})`);
      const result = await contract[config.selectedFunction.name](poolId, formattedInput2);
      
      // Format the result
      let formattedResult;
      if (Array.isArray(result)) {
        formattedResult = result.map(r => r.toString()).join(', ');
      } else {
        formattedResult = result.toString();
      }
      
      console.log(`✅ Raw result: ${formattedResult}`);
      
      // Create formatted value (divided by 1e18)
      let formattedValue = "N/A";
      try {
        if (!isNaN(formattedResult.replace(/,/g, ''))) {
          const numericResult = parseFloat(formattedResult.replace(/,/g, ''));
          console.log(`Numeric result: ${numericResult}`);
          formattedValue = (numericResult / 1e18).toString();
          console.log(`After division by 1e18: ${formattedValue}`);
          
          // Format with 6 decimal places
          if (formattedValue.includes('.')) {
            const parts = formattedValue.split('.');
            if (parts[1].length > 6) {
              formattedValue = `${parts[0]}.${parts[1].substring(0, 6)}`;
            }
          }
          console.log(`Final formatted value: ${formattedValue}`);
        } else {
          console.log(`Result is not a number: ${formattedResult}`);
        }
      } catch (error) {
        console.log(`Error formatting result: ${error.message}`);
      }
      
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
  console.log('Results:', JSON.stringify(results, null, 2));
  
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

// Handle general function calls with any parameters
async function callGeneralFunction(functionName, inputValues) {
  // Find function in ABI
  const functionAbi = config.contractAbi.find(item => item.name === functionName);
  
  if (!functionAbi) {
    return { 
      success: false, 
      error: `Function ${functionName} not found in ABI` 
    };
  }
  
  try {
    // Set up provider and contract
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(
      config.contractAddress,
      config.contractAbi,
      provider
    );
    
    // Format input values based on types
    const formattedInputs = inputValues.map((value, index) => {
      const inputType = functionAbi.inputs[index].type;
      
      // Format based on type
      if (inputType.includes('int')) {
        return value.startsWith('0x') ? value : ethers.getBigInt(value);
      } else if (inputType.includes('bool')) {
        return value === 'true' || value === '1';
      } else if (inputType.includes('bytes') && !value.startsWith('0x')) {
        // Ensure bytes are properly formatted
        return ethers.zeroPadValue(ethers.toBeHex(value), 32);
      } else if (inputType === 'address') {
        // Ensure address is valid
        return ethers.getAddress(value);
      }
      
      return value;
    });
    
    // Call the function
    const result = await contract[functionName](...formattedInputs);
    
    // Format the result
    let formattedResult;
    if (Array.isArray(result)) {
      formattedResult = result.map(r => r.toString()).join(', ');
    } else if (typeof result === 'object' && result !== null) {
      // Handle struct returns
      formattedResult = JSON.stringify(result);
    } else {
      formattedResult = result.toString();
    }
    
    // For numeric results, also provide formatted value
    let formattedValue = "N/A";
    try {
      if (!isNaN(formattedResult.replace(/,/g, ''))) {
        const numericResult = parseFloat(formattedResult.replace(/,/g, ''));
        formattedValue = (numericResult / 1e18).toString();
        if (formattedValue.includes('.')) {
          const parts = formattedValue.split('.');
          if (parts[1].length > 6) {
            formattedValue = `${parts[0]}.${parts[1].substring(0, 6)}`;
          }
        }
      }
    } catch (error) {
      console.log(`Error formatting result: ${error.message}`);
    }
    
    // Return result
    return { 
      success: true, 
      results: [{
        functionName,
        inputs: inputValues,
        result: formattedResult,
        formattedValue,
        error: null
      }]
    };
  } catch (error) {
    console.error(`Error calling function ${functionName}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Add this function to fetch and display full ABI
async function displayFullABI() {
    try {
        // Arbiscan API URL
        const apiUrl = 'https://api.arbiscan.io/api';
        const apiParams = {
            module: 'contract',
            action: 'getabi',
            address: '0x82C13fCab02A168F06E12373F9e5D2C2Bd47e399',
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
            console.log('Full Contract ABI:');
            console.log(JSON.stringify(abi, null, 2));
            return abi;
        } else {
            console.log(`Failed to fetch ABI: ${response.data.message}`);
            return null;
        }
    } catch (error) {
        console.error(`Error fetching ABI: ${error.message}`);
        return null;
    }
}

// ---- Simple Web Server ----

// Create a basic HTML file
const indexHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stryke Epoch Rewards Lookup | Stryke</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            color: #E0E0E0;
            background-color: #1C1C1C;
        }
        h1 {
            text-align: left;
            margin-bottom: 30px;
            color: #FFFFFF;
            font-weight: 500;
        }
        .container {
            background-color: #2A2A2A;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #B0B0B0;
        }
        input, select {
            width: 100%;
            padding: 12px;
            margin-bottom: 20px;
            border: 1px solid #404040;
            border-radius: 8px;
            box-sizing: border-box;
            background-color: #1C1C1C;
            color: #FFFFFF;
            font-size: 14px;
        }
        input:focus, select:focus {
            outline: none;
            border-color: #606060;
        }
        button {
            background-color: rgb(243, 255, 105);
            color: #000000;
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background-color 0.2s;
        }
        button:hover {
            background-color: rgb(220, 230, 95);
        }
        button:disabled {
            background-color: #404040;
            color: #808080;
            cursor: not-allowed;
        }
        .results {
            margin-top: 30px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 16px;
            background-color: #2A2A2A;
            border-radius: 8px;
            overflow: hidden;
        }
        th, td {
            text-align: left;
            padding: 16px;
            border-bottom: 1px solid #404040;
            color: #E0E0E0;
        }
        th {
            background-color: #1C1C1C;
            font-weight: 500;
            color: #B0B0B0;
        }
        tr:hover {
            background-color: #333333;
        }
        .error {
            color: #ff6b6b;
            background-color: rgba(255, 107, 107, 0.1);
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 15px;
            border: 1px solid rgba(255, 107, 107, 0.2);
        }
        .success {
            color: #69db7c;
            background-color: rgba(105, 219, 124, 0.1);
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 15px;
            border: 1px solid rgba(105, 219, 124, 0.2);
        }
        .loading {
            text-align: center;
            margin: 20px 0;
            color: #B0B0B0;
        }
        .hidden {
            display: none;
        }
        .mb-4 {
            margin-bottom: 16px;
        }
        #functionSelectContainer, #inputContainer {
            margin-bottom: 24px;
        }
    </style>
</head>
<body>
    <h1>Stryke Contract Explorer</h1>
    
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
                <!-- This will be dynamically populated based on the selected function -->
            </div>
            
            <button id="submitBtn" onclick="callFunction()">Execute Function</button>
        </div>
        
        <div id="loading" class="loading hidden">
            Processing... Please wait...
        </div>
        
        <div id="results" class="results hidden">
            <h2>Results</h2>
            <table id="resultsTable">
                <thead id="resultsTableHead">
                    <tr>
                        <th>Result</th>
                        <th>Formatted Value</th>
                    </tr>
                </thead>
                <tbody id="resultsBody">
                </tbody>
            </table>
        </div>
    </div>

    <script>
        // Store API response data
        let functionData = null;
        
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
                    functionData = data;
                    const select = document.getElementById('functionSelect');
                    select.innerHTML = '<option value="">Select a function...</option>';
                    
                    // Populate the dropdown with all view functions
                    data.functions.forEach(func => {
                        const option = document.createElement('option');
                        option.value = func.name;
                        option.textContent = \`\${func.name}(\${func.inputs.map(input => input.type).join(', ')})\`;
                        
                        // Set computeRewards as the default selected option
                        if (func.name === 'computeRewards') {
                            option.selected = true;
                        }
                        
                        select.appendChild(option);
                    });
                    
                    // Add event listener for function selection
                    select.addEventListener('change', updateInputFields);
                    
                    // Initialize the input fields for the default selection
                    updateInputFields();
                    
                    if (select.options.length <= 1) {
                        showError('No view functions found in the contract.');
                    }
                } else {
                    showError(data.error || 'Failed to load functions');
                }
            } catch (error) {
                showError('Error connecting to server: ' + error.message);
            }
        }
        
        // Update input fields based on selected function
        function updateInputFields() {
            const functionName = document.getElementById('functionSelect').value;
            const inputContainer = document.getElementById('inputContainer');
            inputContainer.innerHTML = ''; // Clear existing inputs
            
            if (!functionName || !functionData) return;
            
            // Find the selected function in ABI
            const selectedFunction = functionData.functions.find(f => f.name === functionName);
            if (!selectedFunction || !selectedFunction.inputs) return;
            
            // Special case for computeRewards function - use predefined pool IDs
            if (functionName === 'computeRewards') {
                // Add pool ID dropdown
                const poolIdDiv = document.createElement('div');
                poolIdDiv.className = 'mb-4';
                poolIdDiv.innerHTML = \`
                    <label for="poolIdSelect">Select Pool:</label>
                    <select id="poolIdSelect" class="mb-4">
                        <option value="">Select a pool...</option>
                        <option value="0x02d1dc927ecebd87407e1a58a6f2d81f0d6c0ade72ac926e865310aa482b893a">PancakeSwap WETH</option>
                        <option value="0x726dd6a67a7c5b399e0e6954596d6b01605ec97e34e75f5547416146ec001a6c">PancakeSwap WBTC</option>
                        <option value="0x74b6b9b1267a0a12d24cfa963f1a3c96aae2f2cd870847cbc9a70c46b7803ae1">OrangeFinance PCS WETH</option>
                        <option value="0xbb8c79b0fc39426b2cf4bb42501aaa2bdcc7a72f86a564d44a42c6385496618d">OrangeFinance PCS WBTC</option>
                        <option value="0x36ff4f3050b6a776353d7d160276dcf6b310a658502e226fdd2fa049e6c603dd">OrangeFinance PCS ARB</option>
                        <option value="all">All Pools</option>
                    </select>
                \`;
                inputContainer.appendChild(poolIdDiv);
                
                // Add epoch input
                const epochDiv = document.createElement('div');
                epochDiv.innerHTML = \`
                    <label for="epochInput">Enter Epoch:</label>
                    <input type="text" id="epochInput" placeholder="Enter epoch number...">
                \`;
                inputContainer.appendChild(epochDiv);
                return;
            }
            
            // For other functions, create input fields based on function signature
            selectedFunction.inputs.forEach((input, index) => {
                const inputDiv = document.createElement('div');
                inputDiv.className = 'mb-4';
                const inputType = input.type;
                const inputName = input.name || \`input\${index + 1}\`;
                
                inputDiv.innerHTML = \`
                    <label for="input\${index}">\${inputName} (\${inputType}):</label>
                    <input type="text" id="input\${index}" placeholder="Enter \${inputType} value...">
                \`;
                inputContainer.appendChild(inputDiv);
            });
        }
        
        // Call the selected function with input values
        async function callFunction() {
            // Get selected function
            const functionName = document.getElementById('functionSelect').value;
            
            // Validate function selection
            if (!functionName) {
                showError('Please select a function');
                return;
            }
            
            // Find function in ABI
            const selectedFunction = functionData.functions.find(f => f.name === functionName);
            if (!selectedFunction) {
                showError('Function not found in ABI');
                return;
            }
            
            // Handle inputs based on function
            let inputValues = [];
            let useAllPools = false;
            
            if (functionName === 'computeRewards') {
                const poolIdSelect = document.getElementById('poolIdSelect');
                const epochInput = document.getElementById('epochInput');
                
                if (!poolIdSelect.value) {
                    showError('Please select a pool');
                    return;
                }
                
                if (!epochInput.value && epochInput.value !== '0') {
                    showError('Please enter an epoch number');
                    return;
                }
                
                if (isNaN(epochInput.value)) {
                    showError('Epoch must be a number');
                    return;
                }
                
                if (poolIdSelect.value === 'all') {
                    useAllPools = true;
                } else {
                    inputValues = [poolIdSelect.value, epochInput.value];
                }
            } else {
                // For other functions, collect all input values
                for (let i = 0; i < selectedFunction.inputs.length; i++) {
                    const inputElement = document.getElementById(\`input\${i}\`);
                    if (!inputElement) {
                        showError(\`Missing input field for parameter \${i+1}\`);
                        return;
                    }
                    
                    if (!inputElement.value && inputElement.value !== '0') {
                        showError(\`Please enter a value for \${selectedFunction.inputs[i].name || 'parameter ' + (i+1)}\`);
                        return;
                    }
                    
                    inputValues.push(inputElement.value);
                }
            }
            
            // Clear previous messages and results
            clearMessages();
            document.getElementById('results').classList.add('hidden');
            
            // Show loading state
            document.getElementById('loading').classList.remove('hidden');
            document.getElementById('submitBtn').disabled = true;
            
            try {
                let response;
                
                if (functionName === 'computeRewards' && useAllPools) {
                    // Call for all pools
                    response = await fetch('/api/call-all-pools', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            epoch: document.getElementById('epochInput').value
                        })
                    });
                } else {
                    // Regular function call
                    response = await fetch('/api/call-function', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            functionName,
                            inputValues
                        })
                    });
                }
                
                const data = await response.json();
                
                // Hide loading state
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('submitBtn').disabled = false;
                
                if (data.success) {
                    displayResults(data.results, functionName);
                    showSuccess('Successfully executed function!');
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
        function displayResults(results, functionName) {
            const tbody = document.getElementById('resultsBody');
            const thead = document.getElementById('resultsTableHead');
            tbody.innerHTML = '';
            
            // Update table headers based on function name
            if (functionName === 'computeRewards') {
                thead.innerHTML = `
                    <tr>
                        <th>Pool Name</th>
                        <th>Total SYK rewards</th>
                    </tr>
                `;
            } else {
                thead.innerHTML = `
                    <tr>
                        <th>Function</th>
                        <th>Result</th>
                        <th>Formatted Value</th>
                    </tr>
                `;
            }
            
            // Display results based on function type
            if (functionName === 'computeRewards') {
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
            } else {
                results.forEach(result => {
                    const row = document.createElement('tr');
                    
                    // Function name cell
                    const nameCell = document.createElement('td');
                    nameCell.textContent = functionName;
                    row.appendChild(nameCell);
                    
                    // Raw result cell
                    const resultCell = document.createElement('td');
                    if (result.error) {
                        resultCell.textContent = 'Error: ' + result.error;
                    } else {
                        resultCell.textContent = result.result;
                    }
                    row.appendChild(resultCell);
                    
                    // Formatted value cell
                    const formattedCell = document.createElement('td');
                    if (result.error) {
                        formattedCell.textContent = 'N/A';
                    } else {
                        formattedCell.textContent = result.formattedValue;
                    }
                    row.appendChild(formattedCell);
                    
                    tbody.appendChild(row);
                });
            }