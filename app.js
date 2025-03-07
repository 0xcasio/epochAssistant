// Function to handle batch processing
function promptForBatchInputs() {
    const input = config.selectedFunction.inputs[0];
    const typeHint = getTypeHint(input.type);
    
    rl.question(`\nEnter multiple values for ${input.name || 'input'} (${input.type})${typeHint}, separated by commas: `, async (valuesStr) => {
      const values = valuesStr.split(',').map(v => v.trim());
      
      if (values.length === 0) {
        console.log('❌ No values provided. Please try again.');
        promptForBatchInputs();
        return;
      }
      
      // Validate all inputs
      const invalidValues = values.filter(value => !validateInput(value, input.type));
      if (invalidValues.length > 0) {
        console.log(`❌ Invalid values for type ${input.type}: ${invalidValues.join(', ')}`);
        console.log('Please try again.');
        promptForBatchInputs();
        return;
      }
      
      // Format all inputs
      const formattedValues = values.map(value => formatInput(value, input.type));
      
      console.log(`\nProcessing ${formattedValues.length} values...`);
      
      // Process each value sequentially
      const results = [];
      for (let i = 0; i < formattedValues.length; i++) {
        const value = formattedValues[i];
        console.log(`\n[${i+1}/${formattedValues.length}] Processing value: ${value.toString()}`);
        
        try {
          const result = await processSingleValue(value);
          results.push({ value, result, error: null });
        } catch (error) {
          results.push({ value, result: null, error: error.message });
          console.error(`❌ Error processing value ${value}: ${error.message}`);
        }
      }
      
      // Show summary
      console.log('\n===== BATCH PROCESSING SUMMARY =====');
      console.log(`Total values processed: ${results.length}`);
      console.log(`Successful: ${results.filter(r => r.result !== null).length}`);
      console.log(`Failed: ${results.filter(r => r.error !== null).length}`);
      
      // Ask if user wants to make another call
      rl.question('\nDo you want to make another call? (y/n): ', (answer) => {
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          promptFunctionSelection();
        } else {
          console.log('\nThank you for using the Contract Function Caller. Goodbye!');
          rl.close();
        }
      });
    });
  }
  
  // Function to process a single value in batch mode
  async function processSingleValue(value) {
    // Set up provider and contract
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(
      config.contractAddress,
      config.contractAbi,
      provider
    );
    
    // Call the function with the input value
    const result = await contract[config.selectedFunction.name](value);
    
    // Format the result
    let formattedResult;
    if (Array.isArray(result)) {
      formattedResult = result.map(r => r.toString()).join(', ');
    } else {
      formattedResult = result.toString();
    }
    
    console.log(`✅ Result: ${formattedResult}`);
    
    // Save result to CSV
    saveToFile([value], formattedResult);
    
    return formattedResult;
  }// Function to handle a single set of inputs
  function promptForSingleInput() {
    const inputs = config.selectedFunction.inputs;
    const inputValues = [];
    
    function promptForInput(index) {
      if (index >= inputs.length) {
        // All inputs collected
        callContractFunction(inputValues);
        return;
      }
      
      const input = inputs[index];
      const typeHint = getTypeHint(input.type);
      
      rl.question(`Enter ${input.name || 'input ' + (index + 1)} (${input.type})${typeHint}: `, (value) => {
        // Validate input based on type
        if (!validateInput(value, input.type)) {
          console.log(`❌ Invalid input for type ${input.type}. Please try again.`);
          promptForInput(index);
          return;
        }
        
        // Format the input value based on its type
        const formattedValue = formatInput(value, input.type);
        inputValues.push(formattedValue);
        
        // Prompt for next input
        promptForInput(index + 1);
      });
    }
    
    // Start prompting for inputs
    promptForInput(0);
  }// app.js - Main application file
  
  const ethers = require('ethers');
  const fs = require('fs');
  const readline = require('readline');
  const path = require('path');
  const axios = require('axios');
  require('dotenv').config();
  
  // Create readline interface for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  // Configuration
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
        "pcsWethId",
        "pcsWbtcId", 
        "orangePcsWethUsdcGaugeId", 
        "orangePcsWbtcUsdcGaugeId", 
        "orangePcsArbUsdcGaugeId"
      ]
    }
  };
  
  // Main function to call the contract
  async function callContractFunction(inputValues) {
    try {
      console.log(`\nCalling contract function ${config.selectedFunction.name}...`);
      console.log('Inputs:', inputValues);
      console.log('Please wait...');
      
      // Set up provider and contract
      const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
      const contract = new ethers.Contract(
        config.contractAddress,
        config.contractAbi,
        provider
      );
      
      // Call the function with spread operator for all inputs
      const result = await contract[config.selectedFunction.name](...inputValues);
      
      // Format the result
      let formattedResult;
      if (Array.isArray(result)) {
        formattedResult = result.map(r => r.toString()).join(', ');
      } else {
        formattedResult = result.toString();
      }
      
      console.log(`\n✅ Success! Result: ${formattedResult}`);
      
      // Save result to CSV
      saveToFile(inputValues, formattedResult);
      
      // Ask if user wants to make another call
      rl.question('\nDo you want to make another call? (y/n): ', (answer) => {
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          rl.question('Call the same function again? (y/n): ', (sameFunc) => {
            if (sameFunc.toLowerCase() === 'y' || sameFunc.toLowerCase() === 'yes') {
              promptForInputs();
            } else {
              promptFunctionSelection();
            }
          });
        } else {
          console.log('\nThank you for using the Contract Function Caller. Goodbye!');
          rl.close();
        }
      });
      
      return formattedResult;
    } catch (error) {
      console.error('\n❌ Error calling contract:', error.message);
      
      // Ask if user wants to try again
      rl.question('\nDo you want to try again? (y/n): ', (answer) => {
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          promptForInputs();
        } else {
          promptFunctionSelection();
        }
      });
      
      return null;
    }
  }
  
  // Function to save results to a file
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
      const inputHeaders = config.selectedFunction.inputs
        .map((input, index) => input.name || `Input${index+1}`)
        .join(',');
      const headers = `Timestamp,Function,${inputHeaders},Result,FormattedResult,PoolName\n`;
      fs.writeFileSync(config.outputFilePath, headers);
      console.log(`Created new CSV file with headers`);
    }
    
    // Format the CSV line
    const functionName = config.selectedFunction.name;
    const inputValues = inputs.join(',');
    const poolNameStr = poolName || "Unknown";
    const csvLine = `${timestamp},${functionName},${inputValues},${result},${formattedResult},${poolNameStr}\n`;
    
    // Append data
    fs.appendFileSync(config.outputFilePath, csvLine);
    console.log(`📝 Result saved to ${config.outputFilePath}`);
    if (formattedResult !== "N/A") {
      console.log(`   Formatted result (÷ 1e18): ${formattedResult}`);
    }
  }
  
  // Function to prompt user for function selection
  async function promptFunctionSelection() {
    console.log('\n--- Arbiscan Contract Function Caller ---');
    
    if (!config.contractAbi || config.contractAbi.length === 0) {
      console.log('\n⚠️ No ABI available. Fetching contract ABI...');
      await fetchContractAbi();
    }
    
    // Filter to only show read functions (view/pure)
    const readFunctions = config.contractAbi.filter(item => 
      item.type === 'function' && 
      (item.stateMutability === 'view' || item.stateMutability === 'pure')
    );
    
    if (readFunctions.length === 0) {
      console.log('❌ No readable functions found in this contract');
      rl.close();
      return;
    }
    
    console.log('\nAvailable read functions:');
    readFunctions.forEach((func, index) => {
      const inputs = func.inputs.map(input => `${input.type} ${input.name || ''}`).join(', ');
      const outputs = func.outputs.map(output => `${output.type}`).join(', ');
      console.log(`${index + 1}. ${func.name}(${inputs}) -> (${outputs})`);
    });
    
    rl.question('\nSelect a function by number: ', (selection) => {
      const index = parseInt(selection) - 1;
      
      if (isNaN(index) || index < 0 || index >= readFunctions.length) {
        console.log('❌ Invalid selection. Please try again.');
        promptFunctionSelection();
        return;
      }
      
      config.selectedFunction = readFunctions[index];
      console.log(`\n✅ Selected: ${config.selectedFunction.name}`);
      promptForInputs();
    });
  }
  
  // Function to prompt for function inputs with fixed input1 values
  function promptForInputs() {
    if (!config.selectedFunction) {
      promptFunctionSelection();
      return;
    }
    
    const inputs = config.selectedFunction.inputs;
    if (inputs.length === 0) {
      // No inputs needed for this function
      callContractFunction([]);
      return;
    }
    
    // Debug logging to understand what's happening
    console.log('\nFunction details:');
    console.log(`Name: ${config.selectedFunction.name}`);
    console.log(`Inputs: ${inputs.length}`);
    inputs.forEach((input, idx) => {
      console.log(`  Input ${idx+1}: ${input.name || 'unnamed'} (${input.type})`);
    });
    
    // Check if this is our target function pattern - 2 inputs where first is bytes32 and second is uint
    // This matches the contract's specific pattern with (bytes32, uint256)
    const isTargetFunctionPattern = inputs.length === 2 && 
                                    inputs[0].type.toLowerCase().includes('bytes') && 
                                    inputs[1].type.toLowerCase().includes('int');
                                    
    console.log(`Is target function pattern: ${isTargetFunctionPattern}`);
    
    if (isTargetFunctionPattern) {
      // This looks like our target function with input1 (bytes32) and input2 (uint256)
      console.log('Using predefined pool IDs for this function.');
      promptForFixedInput1Values();
    } else {
      // For other functions, use the regular input flow or batch processing
      console.log('Not using predefined pool IDs for this function.');
      if (inputs.length === 1) {
        rl.question('\nDo you want to process multiple values for this input? (y/n): ', (answer) => {
          if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            promptForBatchInputs();
          } else {
            promptForSingleInput();
          }
        });
      } else {
        // For functions with multiple inputs that don't match our target function pattern
        promptForSingleInput();
      }
    }
  }
  
  // Function to process with fixed input1 values
  function promptForFixedInput1Values() {
    const inputs = config.selectedFunction.inputs;
    const input2 = inputs[1]; // This should be the uint256 parameter
    const typeHint = getTypeHint(input2.type);
    
    console.log('\nUsing predefined pool IDs:');
    config.predefinedInputs.poolIds.forEach((id, index) => {
      const name = config.predefinedInputs.poolNames[index] || `Pool ${index + 1}`;
      console.log(`  ${index + 1}. ${name}: ${id}`);
    });
    
    rl.question(`\nEnter ${input2.name || 'input 2'} (${input2.type})${typeHint} for all predefined pool IDs: `, async (input2Value) => {
      // Validate input2
      if (!validateInput(input2Value, input2.type)) {
        console.log(`❌ Invalid input for type ${input2.type}. Please try again.`);
        promptForFixedInput1Values();
        return;
      }
      
      // Format input2
      const formattedInput2 = formatInput(input2Value, input2.type);
      
      console.log(`\nProcessing ${config.predefinedInputs.poolIds.length} predefined pool IDs with ${input2.name || 'input 2'} = ${input2Value}...`);
      
      // Process each predefined input1 value with the same input2
      const results = [];
      for (let i = 0; i < config.predefinedInputs.poolIds.length; i++) {
        const poolId = config.predefinedInputs.poolIds[i];
        const poolName = config.predefinedInputs.poolNames[i] || `Pool ${i + 1}`;
        
        // Use the bytes32 value directly - it should already be in the correct format from the .env file
        console.log(`\n[${i+1}/${config.predefinedInputs.poolIds.length}] Processing ${poolName} with bytes32 ID: ${poolId}`);
        
        try {
          // Set up provider and contract
          const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
          const contract = new ethers.Contract(
            config.contractAddress,
            config.contractAbi,
            provider
          );
          
          // Call the function with the two inputs, use poolId directly without conversion
          const result = await contract[config.selectedFunction.name](poolId, formattedInput2);
          
          // Format the result
          let formattedResult;
          if (Array.isArray(result)) {
            formattedResult = result.map(r => r.toString()).join(', ');
          } else {
            formattedResult = result.toString();
          }
          
          console.log(`✅ Result: ${formattedResult}`);
          
          // Save result to CSV with pool name
          saveToFile([poolId, formattedInput2], formattedResult, poolName);
          
          results.push({ 
            poolName, 
            poolId: poolId, 
            result: formattedResult, 
            error: null 
          });
        } catch (error) {
          console.error(`❌ Error processing ${poolName}: ${error.message}`);
          results.push({ 
            poolName, 
            poolId: poolId, 
            result: null, 
            error: error.message 
          });
        }
      }
      
      // Show summary
      console.log('\n===== PROCESSING SUMMARY =====');
      console.log(`Total pools processed: ${results.length}`);
      console.log(`Successful: ${results.filter(r => r.error === null).length}`);
      console.log(`Failed: ${results.filter(r => r.error !== null).length}`);
      
      // Ask if user wants to make another call
      rl.question('\nDo you want to make another call? (y/n): ', (answer) => {
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          promptFunctionSelection();
        } else {
          console.log('\nThank you for using the Contract Function Caller. Goodbye!');
          rl.close();
        }
      });
    });
  }
  
  // Function to handle batch processing
  function promptForBatchInputs() {
    const input = config.selectedFunction.inputs[0];
    const typeHint = getTypeHint(input.type);
    
    rl.question(`\nEnter multiple values for ${input.name || 'input'} (${input.type})${typeHint}, separated by commas: `, async (valuesStr) => {
      const values = valuesStr.split(',').map(v => v.trim());
      
      if (values.length === 0) {
        console.log('❌ No values provided. Please try again.');
        promptForBatchInputs();
        return;
      }
      
      // Validate all inputs
      const invalidValues = values.filter(value => !validateInput(value, input.type));
      if (invalidValues.length > 0) {
        console.log(`❌ Invalid values for type ${input.type}: ${invalidValues.join(', ')}`);
        console.log('Please try again.');
        promptForBatchInputs();
        return;
      }
      
      // Format all inputs
      const formattedValues = values.map(value => formatInput(value, input.type));
      
      console.log(`\nProcessing ${formattedValues.length} values...`);
      
      // Process each value sequentially
      const results = [];
      for (let i = 0; i < formattedValues.length; i++) {
        const value = formattedValues[i];
        console.log(`\n[${i+1}/${formattedValues.length}] Processing value: ${value.toString()}`);
        
        try {
          const result = await processSingleValue(value);
          results.push({ value, result, error: null });
        } catch (error) {
          results.push({ value, result: null, error: error.message });
          console.error(`❌ Error processing value ${value}: ${error.message}`);
        }
      }
      
      // Show summary
      console.log('\n===== BATCH PROCESSING SUMMARY =====');
      console.log(`Total values processed: ${results.length}`);
      console.log(`Successful: ${results.filter(r => r.result !== null).length}`);
      console.log(`Failed: ${results.filter(r => r.error !== null).length}`);
      
      // Ask if user wants to make another call
      rl.question('\nDo you want to make another call? (y/n): ', (answer) => {
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          promptFunctionSelection();
        } else {
          console.log('\nThank you for using the Contract Function Caller. Goodbye!');
          rl.close();
        }
      });
    });
  }
  
  // Function to process a single value in batch mode
  async function processSingleValue(value) {
    // Set up provider and contract
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(
      config.contractAddress,
      config.contractAbi,
      provider
    );
    
    // Call the function with the input value
    const result = await contract[config.selectedFunction.name](value);
    
    // Format the result
    let formattedResult;
    if (Array.isArray(result)) {
      formattedResult = result.map(r => r.toString()).join(', ');
    } else {
      formattedResult = result.toString();
    }
    
    console.log(`✅ Result: ${formattedResult}`);
    
    // Save result to CSV
    saveToFile([value], formattedResult);
    
    return formattedResult;
  }
  
  // Function to fetch contract ABI from Arbiscan
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
        
        // Ask if the user wants to provide ABI manually
        rl.question('\nWould you like to provide the contract ABI manually? (y/n): ', (answer) => {
          if (answer.toLowerCase() === 'y') {
            rl.question('\nEnter the file path to your ABI JSON file: ', (abiPath) => {
              try {
                const abiJson = fs.readFileSync(abiPath, 'utf8');
                config.contractAbi = JSON.parse(abiJson);
                fs.writeFileSync('contract-abi.json', abiJson);
                console.log('✅ ABI loaded successfully!');
                promptFunctionSelection();
              } catch (error) {
                console.error(`❌ Error loading ABI file: ${error.message}`);
                rl.close();
              }
            });
          } else {
            console.log('\nCannot proceed without ABI. Exiting.');
            rl.close();
          }
        });
        
        return false;
      }
    } catch (error) {
      console.error(`❌ Error fetching ABI: ${error.message}`);
      return false;
    }
  }
  
  // Input validation and formatting helpers
  function validateInput(value, type) {
    if (!value && value !== '0') return false;
    
    // Basic validation based on type
    if (type.includes('int')) {
      return !isNaN(value) || value.startsWith('0x');
    } else if (type.includes('address')) {
      return ethers.utils.isAddress(value);
    } else if (type.includes('bool')) {
      return value === 'true' || value === 'false' || value === '1' || value === '0';
    } else if (type.includes('bytes')) {
      // Allow both numeric values (which we'll convert to bytes) and hex strings
      return !isNaN(value) || value.startsWith('0x');
    }
    
    // For other types like strings, etc. just return true
    return true;
  }
  
  function formatInput(value, type) {
    // Format the input value based on its type
    if (type.includes('int')) {
      return value.startsWith('0x') ? value : ethers.BigNumber.from(value);
    } else if (type.includes('bool')) {
      return value === 'true' || value === '1';
    } else if (type.includes('bytes32')) {
      // For bytes32, convert numeric values to padded hex
      if (value.startsWith('0x')) {
        return value; // Already in hex format
      } else {
        return ethers.utils.hexZeroPad(ethers.utils.hexlify(Number(value)), 32);
      }
    }
    
    // Return as is for other types
    return value;
  }
  
  function getTypeHint(type) {
    // Provide hints for common types
    if (type.includes('int')) {
      return ' (number)';
    } else if (type === 'address') {
      return ' (0x...)';
    } else if (type === 'bool') {
      return ' (true/false)';
    } else if (type.includes('bytes')) {
      return ' (number or 0x...)';
    }
    return '';
  }
  
  // Check if the environment is configured
  function checkConfig() {
    if (!config.contractAddress) {
      console.log('⚠️ CONTRACT_ADDRESS is not set in .env file');
      return false;
    }
    
    // Try to load ABI from file if exists
    try {
      if (fs.existsSync('contract-abi.json')) {
        const abiJson = fs.readFileSync('contract-abi.json', 'utf8');
        config.contractAbi = JSON.parse(abiJson);
        return true;
      }
    } catch (error) {
      console.log('⚠️ Error loading ABI file, will fetch from Arbiscan');
    }
    
    return config.contractAddress ? true : false;
  }
  
  // Setup function
  async function setup() {
    console.clear();
    console.log('🔄 Checking configuration...');
    
    if (!checkConfig()) {
      rl.question('\nPlease enter the contract address: ', async (contractAddress) => {
        config.contractAddress = contractAddress.trim();
        
        // Save to .env file
        const envContent = `RPC_URL=${config.rpcUrl}\nCONTRACT_ADDRESS=${contractAddress}\nOUTPUT_FILE_PATH=${config.outputFilePath}`;
        fs.writeFileSync('.env', envContent);
        
        // Now fetch the ABI
        await fetchContractAbi();
        promptFunctionSelection();
      });
    } else {
      promptFunctionSelection();
    }
  }
  
  // Start the app
  setup();