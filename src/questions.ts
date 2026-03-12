export interface Question {
  id: number;
  title: string;
  description: string;
  buggyCode: {
    python: string;
    java: string;
    c: string;
    cpp: string;
  };
  testCases: {
    input: string;
    expectedOutput: string;
  }[];
  points: number;
}

export const QUESTIONS: Question[] = [
  {
    id: 1,
    title: "🐍 The Infinite Snake Loop",
    description: "Python forgot to move! The loop prints 1 forever. Fix it so it prints 1 to 5.",
    buggyCode: {
      python: "i = 1\nwhile i <= 5:\n    print(i)\n    # i is stuck at 1...",
      java: "public class Main {\n    public static void main(String[] args) {\n        int i = 1;\n        while(i <= 5) {\n            System.out.println(i);\n            // add something here\n        }\n    }\n}",
      c: "#include <stdio.h>\nint main() {\n    int i = 1;\n    while(i <= 5) {\n        printf(\"%d \", i);\n        // help me move!\n    }\n    return 0;\n}",
      cpp: "#include <iostream>\nint main() {\n    int i = 1;\n    while(i <= 5) {\n        std::cout << i << \" \";\n        // increment me!\n    }\n    return 0;\n}"
    },
    testCases: [{ input: "", expectedOutput: "1\n2\n3\n4\n5\n" }],
    points: 10
  },
  {
    id: 2,
    title: "💻 The Confused C Loop",
    description: "Why is it stuck? Check the condition in the for loop carefully.",
    buggyCode: {
      python: "for i in range(1, 100): # should stop at 5\n    if i > 5: break\n    print(i)",
      java: "public class Main {\n    public static void main(String[] args) {\n        for(int i = 1; i == 5; i++) { // wait, == or <=?\n            System.out.println(i);\n        }\n    }\n}",
      c: "#include <stdio.h>\nint main() {\n    int i;\n    for(i = 1; i = 5; i++) { // assignment or comparison?\n        printf(\"%d \", i);\n    }\n    return 0;\n}",
      cpp: "#include <iostream>\nint main() {\n    for(int i = 1; i = 5; i++) {\n        std::cout << i << \" \";\n    }\n    return 0;\n}"
    },
    testCases: [{ input: "", expectedOutput: "1 2 3 4 5" }],
    points: 10
  },
  {
    id: 3,
    title: "☕ Java's Identity Crisis",
    description: "Are these strings twins? Use the right way to compare string content.",
    buggyCode: {
      python: "a = 'hello'\nb = 'hello'\nif a is b: # technically works in py but let's use ==\n    print('Equal')\nelse:\n    print('Not Equal')",
      java: "public class Main {\n    public static void main(String[] args) {\n        String a = \"hello\";\n        String b = new String(\"hello\");\n        if(a == b) System.out.println(\"Equal\");\n        else System.out.println(\"Not Equal\");\n    }\n}",
      c: "#include <stdio.h>\n#include <string.h>\nint main() {\n    char* a = \"hello\";\n    char* b = \"hello\";\n    if (a == b) printf(\"Equal\\n\"); // risky\n    else printf(\"Not Equal\\n\");\n    return 0;\n}",
      cpp: "#include <iostream>\n#include <string>\nint main() {\n    std::string a = \"hello\";\n    std::string b = \"hello\";\n    if(a == b) std::cout << \"Equal\" << std::endl;\n    return 0;\n}"
    },
    testCases: [{ input: "", expectedOutput: "Equal\n" }],
    points: 10
  },
  {
    id: 4,
    title: "📦 The Lost Number Mystery",
    description: "Programmers start counting at 0! Fix the indexing to print 10 20 30 40.",
    buggyCode: {
      python: "numbers = [10, 20, 30, 40]\nfor i in range(len(numbers)):\n    print(numbers[i+1]) # oops",
      java: "public class Main {\n    public static void main(String[] args) {\n        int[] numbers = {10, 20, 30, 40};\n        for(int i = 0; i < numbers.length; i++) {\n            System.out.println(numbers[i+1]);\n        }\n    }\n}",
      c: "#include <stdio.h>\nint main() {\n    int numbers[] = {10, 20, 30, 40};\n    for(int i = 0; i < 4; i++) {\n        printf(\"%d \", numbers[i+1]);\n    }\n    return 0;\n}",
      cpp: "#include <iostream>\nint main() {\n    int numbers[] = {10, 20, 30, 40};\n    for(int i = 0; i < 4; i++) {\n        std::cout << numbers[i+1] << \" \";\n    }\n    return 0;\n}"
    },
    testCases: [{ input: "", expectedOutput: "10\n20\n30\n40\n" }],
    points: 15
  },
  {
    id: 5,
    title: "🧮 The Lazy Sum Variable",
    description: "It started from garbage! Initialize the sum variable.",
    buggyCode: {
      python: "sum_val = None # should be 0\nfor i in range(1, 6):\n    sum_val = sum_val + i\nprint(sum_val)",
      java: "public class Main {\n    public static void main(String[] args) {\n        int sum; // uninitialized\n        for(int i=1; i<=5; i++) sum += i;\n        System.out.println(sum);\n    }\n}",
      c: "#include <stdio.h>\nint main() {\n    int sum;\n    for(int i=1; i<=5; i++) sum = sum + i;\n    printf(\"%d\", sum);\n    return 0;\n}",
      cpp: "#include <iostream>\nint main() {\n    int sum;\n    for(int i=1; i<=5; i++) sum += i;\n    std::cout << sum;\n    return 0;\n}"
    },
    testCases: [{ input: "", expectedOutput: "15" }],
    points: 15
  },
  {
    id: 6,
    title: "🔁 The Endless Java Marathon",
    description: "This loop never retires! Add the missing increment.",
    buggyCode: {
      python: "i = 1\nwhile i <= 5:\n    print(i)\n    # i is resting",
      java: "public class Test {\n    public static void main(String[] args) {\n        int i = 1;\n        while(i <= 5) {\n            System.out.println(i);\n            // i needs to grow\n        }\n    }\n}",
      c: "#include <stdio.h>\nint main() {\n    int i = 1;\n    while(i <= 5) printf(\"%d \", i); // missing i++\n    return 0;\n}",
      cpp: "#include <iostream>\nint main() {\n    int i = 1;\n    while(i <= 5) std::cout << i << \" \";\n    return 0;\n}"
    },
    testCases: [{ input: "", expectedOutput: "1\n2\n3\n4\n5\n" }],
    points: 15
  },
  {
    id: 7,
    title: "🎭 The Silent Function",
    description: "It calculates but never returns! Make the function return the result.",
    buggyCode: {
      python: "def add(a, b):\n    print(a + b)\n\nresult = add(3, 4)\nprint(result) # should be 7",
      java: "public class Main {\n    public static int add(int a, int b) {\n        System.out.println(a + b);\n        return 0; // wrong\n    }\n    public static void main(String[] args) {\n        System.out.println(add(3, 4));\n    }\n}",
      c: "#include <stdio.h>\nint add(int a, int b) {\n    int res = a + b;\n    // forgot something?\n}\nint main() {\n    printf(\"%d\", add(3, 4));\n    return 0;\n}",
      cpp: "#include <iostream>\nint add(int a, int b) {\n    int res = a + b;\n}\nint main() {\n    std::cout << add(3, 4);\n    return 0;\n}"
    },
    testCases: [{ input: "", expectedOutput: "7\n" }],
    points: 20
  },
  {
    id: 8,
    title: "🚧 Array Danger Zone",
    description: "You crossed the boundary! Fix the loop limit.",
    buggyCode: {
      python: "arr = [1, 2, 3, 4, 5]\nfor i in range(6):\n    print(arr[i])",
      java: "public class Main {\n    public static void main(String[] args) {\n        int[] arr = {1, 2, 3, 4, 5};\n        for(int i=0; i<=5; i++) System.out.println(arr[i]);\n    }\n}",
      c: "#include <stdio.h>\nint main() {\n    int arr[5] = {1, 2, 3, 4, 5};\n    for(int i=0; i<=5; i++) printf(\"%d \", arr[i]);\n    return 0;\n}",
      cpp: "#include <iostream>\nint main() {\n    int arr[5] = {1, 2, 3, 4, 5};\n    for(int i=0; i<=5; i++) std::cout << arr[i] << \" \";\n    return 0;\n}"
    },
    testCases: [{ input: "", expectedOutput: "1 2 3 4 5" }],
    points: 20
  },
  {
    id: 9,
    title: "💥 The Null Monster",
    description: "Java program crashed! Handle the null case before calling methods.",
    buggyCode: {
      python: "name = None\nif name == 'John': # handles None fine but let's be safe\n    print('Hello John')",
      java: "public class Main {\n    public static void main(String[] args) {\n        String name = null;\n        if(name.equals(\"John\")) { // CRASH\n            System.out.println(\"Hello John\");\n        }\n    }\n}",
      c: "#include <stdio.h>\nint main() {\n    char* name = NULL;\n    if (name[0] == 'J') printf(\"Hello John\"); // CRASH\n    return 0;\n}",
      cpp: "#include <iostream>\n#include <string>\nint main() {\n    std::string* name = nullptr;\n    if (*name == \"John\") std::cout << \"Hello John\"; // CRASH\n    return 0;\n}"
    },
    testCases: [{ input: "", expectedOutput: "Hello John\n" }], // Assuming they fix it to work
    points: 30
  },
  {
    id: 10,
    title: "🪄 The Magical List",
    description: "Why is it remembering everything? Fix the mutable default argument.",
    buggyCode: {
      python: "def add_item(item, lst=[]):\n    lst.append(item)\n    return lst\n\nprint(add_item(1))\nprint(add_item(2))\nprint(add_item(3))",
      java: "import java.util.*;\npublic class Main {\n    static List<Integer> list = new ArrayList<>(); // shared state\n    public static List<Integer> addItem(int item) {\n        list.add(item);\n        return list;\n    }\n    public static void main(String[] args) {\n        System.out.println(addItem(1));\n        System.out.println(addItem(2));\n    }\n}",
      c: "// Not easily applicable in C, but here's a static buffer issue\n#include <stdio.h>\nint* add(int i) {\n    static int buffer[10];\n    static int count = 0;\n    buffer[count++] = i;\n    return buffer;\n}",
      cpp: "#include <iostream>\n#include <vector>\nstd::vector<int> addItem(int item) {\n    static std::vector<int> list;\n    list.push_back(item);\n    return list;\n}"
    },
    testCases: [{ input: "", expectedOutput: "[1]\n[2]\n[3]\n" }],
    points: 30
  }
];
