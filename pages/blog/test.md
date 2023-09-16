# Test page

This page tests the features and styling of my static website generator. If this doesn't sound particularly interesting, feel free to check out the [homepage](/pages/index.md) instead.

## Text

This is a paragraph of text. Text can be **bolded**, _italicized_, or even **_bolded and italicized simultaneously_**. If the text in the previous sentence all looks the same, I probably messed up the fonts again.

Hopefully the spacing between this paragraph and the preceding one looks alright. This sentence contains a link to [the page you're currently looking at](/pages/blog/test.md) (to show you what a visited link looks like) and a link to [another page that you probably haven't visited](https://youtu.be/dQw4w9WgXcQ).

### This is an excessively verbose section heading, which will wrap to the next line

This sentence is pitifully short in comparison.

## Math

An unsigned binary representation of integers uses $k$ bits to represent $2^k$ distinct integers; specifically, those in the interval $\left[ 0, 2^k \right)$. Two's complement also uses $k$ bits to represent $2^k$ distinct integers, but the interval of representable integers is $\left[ -2^{k-1}, 2^{k-1} \right)$ instead.

The closed form of the sum of a geometric series is:

```math
\sum_{k=0}^\infty ar^k = \frac{a}{1-r} \text{ for } \lvert r \rvert < 1
```

I totally looked that up on [Wikipedia](https://en.wikipedia.org/wiki/Geometric_series#Formulation).

## Code

### Inline code (also works in `h1`, `h2`, etc.)

In Python, [f-strings](https://docs.python.org/3/tutorial/inputoutput.html#formatted-string-literals) make it really easy to substitute variable values into a template string. For example, if the `name` variable is set to `!py "world"`, then `!py print(f"Hello {name}!")` will output `Hello world!`. I'm a big fan of having syntax highlighting in inline code.

### Code blocks

Let's implement the same thing in a few different languages to check out the syntax highlighting.

```py
#!/usr/bin/env python3

class Thing:
    def __init__(self, name: str):
        self.name = name.replace("\t", " ")

    @staticmethod
    def fib(n: int) -> list[int]:
        """Return the first n Fibonacci numbers."""
        nums = [0, 1]
        while len(nums) < n:
            nums.append(nums[-1] + nums[-2])
        return nums[:n]


# This carefully crafted comment is exactly seventy-two characters long.
if __name__ == "__main__":
    n = 10
    print(f"fib({n}) = {Thing.fib(n)}")
```

```java
import java.util.*;

public class Thing {
    public String name;

    public Thing(String name) {
        this.name = name.replace("\t", " ");
    }

    /**
     * @return The first n Fibonacci numbers.
     */
    private static List<Integer> fib(int n) {
        var nums = new ArrayList<>(List.of(0, 1));
        while (nums.size() < n) {
            nums.add(nums.get(nums.size() - 1) + nums.get(nums.size() - 2));
        }
        return nums.subList(0, n);
    }

    // This line is exactly eighty characters long if you count the indentation.
    public static void main(String[] args) {
        int n = 10;
        System.out.printf("fib(%d) = %s\n", n, fib(10));
    }
}
```

```ts
class Thing {
  name: string;

  constructor(name: string) {
    this.name = name.replace("\t", " ");
  }

  /**
   * @return The first n Fibonacci numbers.
   */
  static fib(n: number) {
    const nums = [0, 1];
    while (nums.length < n) {
      nums.push(nums[nums.length - 1] + nums[nums.length - 2]);
    }
    return nums.slice(0, n);
  }
}

// I made this comment a hundred characters long to help me validate the horizontal scroll behavior.

const n = 10;
console.log(`fib(${n}) = ${JSON.stringify(Thing.fib(n))}`);

const regex = /^(0|[1-9]\d*)(\.\d+)?$/m;
```

Preprocessor directives:

```c
#include <stdio.h>

#define GREETING(NAME) "Hello " NAME "!"

int main(int argc, char* argv[]) {
    printf("%s\n", GREETING("world"));
}
```

Shell commands:

```sh
javac -Xlint:all -d out $(find src -type f -name '*\.java')
```

## Lists

Numbers are pretty cool:

1. One is the smallest positive integer.
   1. However, it is not the smallest non-negative integer --- that would be zero.
2. Two has the distinction of being the only even prime number.

   Also, thanks to bilateral symmetry, there are lots of body parts that humans have two of.

3. [Threes](http://play.threesgame.com/) is a cute little mobile game.

Some other fun games include:

- Kerbal Space Program (the first one)
- Minecraft
- Factorio
  - Or so I've heard; I've been too scared to try it
