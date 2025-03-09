// Minimal version of app-web.js for Vercel deployment
const { ethers } = require('ethers');

// Hard-coded minimal ABI that includes only computeRewards function
const contractAbi = [
  {
    "inputs": [
      {"name": "input1", "type": "bytes32"},
      {"name": "input2", "type": "uint256"}
    ],
    "name": "computeRewards",
    "outputs": [
      {"type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// Configuration with hardcoded values
const config = {
  rpcUrl: 'https://arb1.arbitrum.io/rpc',
  contractAddress: '0x82C13fCab02A168F06E12373F9e5D2C2Bd47e399',
  contractAbi: contractAbi,
  predefinedInputs: {
    poolIds: [
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

// Simple HTML page
const indexHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Stryke Contract Rewards</title>
    <style>
        body { 
            font-family: Arial; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px;
            background: #1c1c1c;
            color: #fff;
        }
        select, input, button { 
            padding: 8px; 
            margin: 5px 0; 
            width: 100%;
            background: #333;
            color: #fff;
            border: 1px solid #555;
        }
        button {
            background: #f3ff69;
            color: #000;
            cursor: pointer;
        }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 20px;
        }
        th, td { 
            border: 1px solid #444; 
            padding: 8px; 
            text-align: left;
        }
        .hidden { display: none; }
    </style>
</head>
<body>
    <h1>Stryke Rewards Lookup</h1>
    <div>
        <select id="poolSelect">
            <option value="">Select a pool...</option>
            <option value="0x02d1dc927ecebd87407e1a58a6f2d81f0d6c0ade72ac926e865310aa482b893a">PancakeSwap WETH</option>
            <option value="0x726dd6a67a7c5b399e0e6954596d6b01605ec97e34e75f5547416146ec001a6c">PancakeSwap WBTC</option>
            <option value="0x74b6b9b1267a0a12d24cfa963f1a3c96aae2f2cd870847cbc9a70c46b7803ae1">OrangeFinance PCS WETH</option>
            <option value="0xbb8c79b0fc39426b2cf4bb42501aaa2bdcc7a72f86a564d44a42c6385496618d">OrangeFinance PCS WBTC</option>
            <option value="0x36ff4f3050b6a776353d7d160276dcf6b310a658502e226fdd2fa049e6c603dd">OrangeFinance PCS ARB</option>
            <option value="all">All Pools</option>
        </select>
        <input type="number" id="epochInput" placeholder="Enter epoch number" min="0">
        <button onclick="lookupRewards()">Lookup Rewards</button>
    </div>
    <div id="error" style="color: red; margin-top: 10px;"></div>
    <div id="loading" class="hidden">Loading...</div>
    <div id="results" class="hidden">
        <h2>Results</h2>
        <table>
            <thead>
                <tr>
                    <th>Pool</th>
                    <th>Rewards</th>
                </tr>
            </thead>
            <tbody id="resultsBody"></tbody>
        </table>
    </div>

    <script>
        async function lookupRewards() {
            const poolId = document.getElementById('poolSelect').value;
            const epoch = document.getElementById('epochInput').value;
            
            if (!poolId) {
                showError('Please select a pool');
                return;
            }
            
            if (!epoch && epoch !== '0') {
                showError('Please enter an epoch number');
                return;
            }
            
            // Hide errors, show loading
            document.getElementById('error').textContent = '';
            document.getElementById('loading').classList.remove('hidden');
            document.getElementById('results').classList.add('hidden');
            
            try {
                let response;
                
                if (poolId === 'all') {
                    response = await fetch('/api/all-pools', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ epoch })
                    });
                } else {
                    response = await fetch('/api/rewards', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ poolId, epoch })
                    });
                }
                
                const data = await response.json();
                
                if (data.success) {
                    displayResults(data.results);
                } else {
                    showError(data.error || 'Failed to fetch rewards');
                }
            } catch (error) {
                showError('Error: ' + error.message);
            } finally {
                document.getElementById('loading').classList.add('hidden');
            }
        }
        
        function displayResults(results) {
            const tbody = document.getElementById('resultsBody');
            tbody.innerHTML = '';
            
            results.forEach(result => {
                const row = document.createElement('tr');
                
                const poolCell = document.createElement('td');
                poolCell.textContent = result.poolName;
                row.appendChild(poolCell);
                
                const rewardCell = document.createElement('td');
                rewardCell.textContent = result.formattedValue;
                row.appendChild(rewardCell);
                
                tbody.appendChild(row);
            });
            
            document.getElementById('results').classList.remove('hidden');
        }
        
        function showError(message) {
            document.getElementById('error').textContent = message;
        }
    </script>
</body>
</html>
`;

// Process function call for all pool IDs
async function processAllPoolIds(epochValue) {
  const results = [];
  console.log(`Processing ${config.predefinedInputs.poolIds.length} predefined pool IDs with epoch = ${epochValue}`);
  
  try {
    // Format input2
    const formattedEpoch = ethers.getBigInt(epochValue);
    
    // Set up provider and contract
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(
      config.contractAddress,
      config.contractAbi,
      provider
    );
    
    // Process each predefined pool ID with the same epoch
    for (let i = 0; i < config.predefinedInputs.poolIds.length; i++) {
      const poolId = config.predefinedInputs.poolIds[i];
      const poolName = config.predefinedInputs.poolNames[i] || `Pool ${i + 1}`;
      
      console.log(`Processing ${poolName} with ID: ${poolId}`);
      
      try {
        // Call the function with the two inputs
        const result = await contract.computeRewards(poolId, formattedEpoch);
        
        // Format the result
        const formattedResult = result.toString();
        
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
        console.error(`Error processing ${poolName}: ${error.message}`);
        results.push({ 
          poolName, 
          poolId, 
          result: null,
          formattedValue: null,
          error: error.message 
        });
      }
    }
  } catch (error) {
    console.error(`Error in processAllPoolIds: ${error.message}`);
    throw error;
  }
  
  return { success: true, results };
}

// Handler for Vercel
module.exports = async (req, res) => {
  try {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Parse URL path
    const { pathname } = new URL(req.url, `https://${req.headers.host}`);
    
    // Route requests
    if (req.method === 'GET' && (pathname === '/' || pathname === '')) {
      // Serve HTML page
      res.setHeader('Content-Type', 'text/html');
      res.status(200).send(indexHtml);
    }
    else if (req.method === 'POST' && pathname === '/api/rewards') {
      // Get single pool rewards
      const { poolId, epoch } = req.body;
      
      if (!poolId) {
        res.status(400).json({ success: false, error: 'Pool ID is required' });
        return;
      }
      
      if (!epoch && epoch !== '0') {
        res.status(400).json({ success: false, error: 'Epoch is required' });
        return;
      }
      
      try {
        // Set up provider and contract
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        const contract = new ethers.Contract(
          config.contractAddress,
          config.contractAbi,
          provider
        );
        
        // Call computeRewards function
        const result = await contract.computeRewards(poolId, ethers.getBigInt(epoch));
        
        // Format the result
        const formattedResult = result.toString();
        
        // Format value (divide by 1e18)
        let formattedValue = "N/A";
        if (!isNaN(formattedResult.replace(/,/g, ''))) {
          const numericResult = parseFloat(formattedResult.replace(/,/g, ''));
          formattedValue = (numericResult / 1e18).toFixed(6);
        }
        
        // Get pool name
        const poolIndex = config.predefinedInputs.poolIds.indexOf(poolId);
        const poolName = poolIndex !== -1 
          ? config.predefinedInputs.poolNames[poolIndex] 
          : "Custom Pool";
        
        res.status(200).json({ 
          success: true, 
          results: [{ 
            poolName, 
            poolId, 
            result: formattedResult,
            formattedValue,
            error: null
          }]
        });
      } catch (error) {
        console.error('Error calling contract:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    }
    else if (req.method === 'POST' && pathname === '/api/all-pools') {
      // Get rewards for all pools
      const { epoch } = req.body;
      
      if (!epoch && epoch !== '0') {
        res.status(400).json({ success: false, error: 'Epoch is required' });
        return;
      }
      
      try {
        const result = await processAllPoolIds(epoch);
        res.status(200).json(result);
      } catch (error) {
        console.error('Error processing all pools:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    }
    else {
      // Not found
      res.status(404).send('Not Found');
    }
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).send('Internal Server Error: ' + error.message);
  }
};